#!/usr/bin/env python3
"""Main entry point for PiGuard Python version."""
import asyncio
import logging
import signal
import sys
from piguard import PiGuard

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


async def main():
    """Main entry point."""
    pi_guard = PiGuard()
    
    # Set up signal handlers
    def signal_handler(signum, frame):
        logging.info(f"\n[PiGuard] Received signal {signum}")
        asyncio.create_task(pi_guard.shutdown())
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        await pi_guard.initialize()
        
        # Keep the program running
        while pi_guard.is_running:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        logging.info("\n[PiGuard] Received KeyboardInterrupt")
        await pi_guard.shutdown()
    except Exception as error:
        logging.error(f"[PiGuard] Uncaught exception: {error}", exc_info=True)
        await pi_guard.shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass

