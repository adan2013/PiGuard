"""Main PiGuard surveillance system."""
import asyncio
import logging
import signal
import sys
import platform
from typing import Dict, Optional
from datetime import datetime
from config import Config
from gsm_module import GSMModule

logger = logging.getLogger(__name__)

# GPIO offset (same as Node.js version)
GPIO_OFFSET = 512

# Try to import GPIO library
try:
    import RPi.GPIO as GPIO
    GPIO_AVAILABLE = True
except ImportError:
    GPIO_AVAILABLE = False
    GPIO = None


class TriggerInfo:
    """Information about a GPIO trigger."""
    
    def __init__(self, gpio_pin: Optional[object], pin: int, name: str):
        self.gpio_pin = gpio_pin
        self.pin = pin
        self.name = name


class PiGuard:
    """Main PiGuard surveillance system class."""
    
    def __init__(self):
        self.config = Config()
        self.gsm = GSMModule(self.config)
        self.triggers: Dict[str, TriggerInfo] = {}
        self.is_running: bool = False
        self.last_alert_time: float = 0.0
        self.cooldown_period: float = 5 * 60 * 1000  # 5 minutes in milliseconds
        self.event_loop: Optional[asyncio.AbstractEventLoop] = None
        self.trigger_queue: Optional[asyncio.Queue] = None
    
    async def initialize(self) -> None:
        """Initialize the PiGuard system."""
        print("=================================")
        print("     PiGuard Starting Up")
        print("=================================")
        
        self.config.display()
        
        try:
            self.event_loop = asyncio.get_event_loop()
            # Initialize trigger queue
            self.trigger_queue = asyncio.Queue()
            # Start trigger queue processor
            asyncio.create_task(self._process_trigger_queue())
            
            await self.gsm.initialize()
            await self._setup_triggers()
            
            self.is_running = True
            print("[PiGuard] System ready and monitoring...\n")
            
            await self._send_startup_notification()
        except Exception as error:
            error_message = str(error)
            logger.error(f"[PiGuard] Initialization failed: {error_message}")
            raise
    
    async def _setup_triggers(self) -> None:
        """Set up GPIO triggers for monitoring."""
        logger.info("[PiGuard] Setting up GPIO triggers...")
        
        if platform.system() != "Linux":
            logger.warning(
                f"[PiGuard] GPIO is only supported on Linux (Raspberry Pi). "
                f"Current platform: {platform.system()}"
            )
            logger.warning("[PiGuard] GPIO triggers will not be available.")
            return
        
        if not GPIO_AVAILABLE:
            logger.warning(
                "[PiGuard] RPi.GPIO library not available. "
                "GPIO triggers will not be available."
            )
            return
        
        gpio_config = self.config.get_gpio_config()
        
        try:
            GPIO.setmode(GPIO.BCM)
            success_count = 0
            
            for key, pin in gpio_config.items():
                trigger_name = self.config.get_trigger_name(key)
                gpio_pin = None
                
                try:
                    # Clean up any existing GPIO setup
                    try:
                        GPIO.cleanup(pin)
                        await asyncio.sleep(0.1)
                    except Exception:
                        pass
                    
                    # Set up GPIO pin as input with pull-up resistor
                    GPIO.setup(pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
                    
                    # Create callback that queues trigger events
                    def gpio_callback(channel):
                        """GPIO callback that queues trigger events."""
                        if (
                            self.event_loop
                            and not self.event_loop.is_closed()
                            and self.trigger_queue
                        ):
                            self.event_loop.call_soon_threadsafe(
                                self.trigger_queue.put_nowait,
                                (key, trigger_name)
                            )
                    
                    # Add event detection for rising edges
                    GPIO.add_event_detect(
                        pin,
                        GPIO.RISING,
                        callback=gpio_callback,
                        bouncetime=300,
                    )
                    
                    initial_value = GPIO.input(pin)
                    logger.info(
                        f"[PiGuard] ✓ {trigger_name} monitoring on GPIO {pin} "
                        f"(initial state: {initial_value})"
                    )
                    
                    # Create a simple object to represent the GPIO pin
                    gpio_pin = type('GPIO', (), {'pin': pin})()
                    
                    self.triggers[key] = TriggerInfo(gpio_pin, pin, trigger_name)
                    success_count += 1
                except Exception as error:
                    logger.error(
                        f"[PiGuard] Failed to setup trigger {key} "
                        f"({trigger_name}) on GPIO {pin}: {error}"
                    )
            
            if success_count > 0:
                logger.info(
                    f"[PiGuard] {success_count} trigger(s) configured successfully\n"
                )
            else:
                logger.warning("[PiGuard] No GPIO triggers configured\n")
        except Exception as error:
            logger.error(f"[PiGuard] Failed to setup GPIO: {error}")
    
    async def _process_trigger_queue(self) -> None:
        """Process trigger events from the queue."""
        if not self.trigger_queue:
            return
        
        while self.is_running:
            try:
                trigger_key, trigger_name = await asyncio.wait_for(
                    self.trigger_queue.get(), timeout=1.0
                )
                await self._handle_trigger(trigger_key, trigger_name)
            except asyncio.TimeoutError:
                continue
            except Exception as error:
                logger.error(f"[PiGuard] Error processing trigger queue: {error}")
    
    async def _handle_trigger(self, trigger_key: str, trigger_name: str) -> None:
        """Handle a GPIO trigger event."""
        timestamp = datetime.now().isoformat()
        print(f"\n[ALERT] {timestamp} - {trigger_name} TRIGGERED!")
        
        if self._is_in_cooldown():
            logger.info("[PiGuard] System is in cooldown period, skipping alert")
            return
        
        self.last_alert_time = datetime.now().timestamp() * 1000
        
        try:
            results = await self.gsm.send_alert(trigger_name)
            
            for result in results:
                if not result.get("success"):
                    logger.error(
                        f"[PiGuard] Failed to send alert to "
                        f"{result.get('phoneNumber')}: {result.get('error')}"
                    )
        except Exception as error:
            error_message = str(error)
            logger.error(
                f"[PiGuard] Error sending alert for {trigger_name}: "
                f"{error_message}"
            )
        
        print("")
    
    def _is_in_cooldown(self) -> bool:
        """Check if system is in cooldown period."""
        if self.last_alert_time == 0.0:
            return False
        
        elapsed = (datetime.now().timestamp() * 1000) - self.last_alert_time
        return elapsed < self.cooldown_period
    
    async def _send_startup_notification(self) -> None:
        """Send startup notification SMS."""
        try:
            phone_numbers = self.config.get_phone_numbers()
            if not phone_numbers:
                return
            
            message = (
                f"PiGuard surveillance system is now active at "
                f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
            )
            
            for phone_number in phone_numbers:
                try:
                    await self.gsm.send_sms(phone_number, message)
                    logger.info(
                        f"[PiGuard] Startup notification sent to {phone_number}"
                    )
                except Exception as error:
                    logger.error(
                        f"[PiGuard] Failed to send startup notification to "
                        f"{phone_number}: {error}"
                    )
        except Exception as error:
            error_message = str(error)
            logger.error(
                f"[PiGuard] Error sending startup notification: {error_message}"
            )
    
    async def shutdown(self) -> None:
        """Shutdown the PiGuard system."""
        print("\n[PiGuard] Shutting down...")
        
        self.is_running = False
        
        # Clean up GPIO pins
        if GPIO_AVAILABLE:
            for key, trigger in self.triggers.items():
                try:
                    GPIO.remove_event_detect(trigger.pin)
                    logger.info(f"[PiGuard] Removed event detection for GPIO {trigger.pin}")
                except Exception as error:
                    logger.error(
                        f"[PiGuard] Error removing event detection for GPIO "
                        f"{trigger.pin}: {error}"
                    )
            
            try:
                GPIO.cleanup()
            except Exception:
                pass
        
        await self.gsm.close()
        
        print("[PiGuard] Shutdown complete")
        sys.exit(0)
    
    def get_status(self) -> Dict:
        """Get system status."""
        in_cooldown = self._is_in_cooldown()
        return {
            "running": self.is_running,
            "triggers": [
                {
                    "key": key,
                    "name": trigger.name,
                    "pin": trigger.pin,
                    "cooldown": in_cooldown,
                }
                for key, trigger in self.triggers.items()
            ],
            "gsm": self.gsm.get_status(),
        }


async def main():
    """Main entry point."""
    # Set up logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s: %(message)s",
    )
    
    pi_guard = PiGuard()
    
    # Set up signal handlers
    def signal_handler(signum, frame):
        logger.info(f"\n[PiGuard] Received signal {signum}")
        asyncio.create_task(pi_guard.shutdown())
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        await pi_guard.initialize()
        
        # Keep the program running
        while pi_guard.is_running:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        logger.info("\n[PiGuard] Received KeyboardInterrupt")
        await pi_guard.shutdown()
    except Exception as error:
        logger.error(f"[PiGuard] Uncaught exception: {error}")
        await pi_guard.shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass

