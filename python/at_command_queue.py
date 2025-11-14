"""AT command queue management."""
import asyncio
import logging
from typing import Callable, Optional, Dict, Any
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class CommandObject:
    """Represents a queued AT command."""
    command: str
    expected_response: str
    retries: int = 0
    timestamp: float = 0.0
    _resolve: Optional[Callable] = None
    _reject: Optional[Callable] = None
    
    def __post_init__(self):
        if self.timestamp == 0.0:
            self.timestamp = datetime.now().timestamp() * 1000


class ATCommandQueue:
    """Queue for managing AT commands with retry logic."""
    
    def __init__(self, timeout: int = 5000, max_retries: int = 3):
        self.queue: list[CommandObject] = []
        self.processing: bool = False
        self.max_retries: int = max_retries
        self.current_command: Optional[CommandObject] = None
        self.executor: Optional[Callable] = None
        self.timeout: int = timeout
    
    async def add(
        self, command: str, expected_response: str = "OK"
    ) -> str:
        """Add a command to the queue."""
        loop = asyncio.get_event_loop()
        future = loop.create_future()
        
        command_obj = CommandObject(
            command=command,
            expected_response=expected_response,
            retries=0,
            _resolve=lambda r: future.set_result(r) if not future.done() else None,
            _reject=lambda e: future.set_exception(e) if not future.done() else None,
        )
        
        self.queue.append(command_obj)
        logger.info(
            f"[ATQueue] Added command: {command} (Queue size: {len(self.queue)})"
        )
        
        if not self.processing:
            asyncio.create_task(self._process_next())
        
        return await future
    
    async def _process_next(self) -> None:
        """Process commands in the queue."""
        while True:
            if len(self.queue) == 0:
                self.processing = False
                self.current_command = None
                return
            
            self.processing = True
            self.current_command = self.queue.pop(0)
            
            logger.info(f"[ATQueue] Processing: {self.current_command.command}")
            
            try:
                response = await self._execute_command(self.current_command)
                logger.info(f"[ATQueue] Success: {self.current_command.command}")
                if self.current_command._resolve:
                    self.current_command._resolve(response)
            except Exception as error:
                error_message = str(error)
                logger.error(
                    f"[ATQueue] Error: {self.current_command.command} - {error_message}"
                )
                
                if self.current_command.retries < self.max_retries:
                    self.current_command.retries += 1
                    logger.info(
                        f"[ATQueue] Retrying ({self.current_command.retries}/"
                        f"{self.max_retries}): {self.current_command.command}"
                    )
                    self.queue.insert(0, self.current_command)
                else:
                    logger.error(
                        f"[ATQueue] Max retries exceeded for: "
                        f"{self.current_command.command}"
                    )
                    if self.current_command._reject:
                        self.current_command._reject(error)
            
            # Yield control to allow other tasks to run
            await asyncio.sleep(0)
    
    async def _execute_command(self, command_obj: CommandObject) -> str:
        """Execute a command using the executor function."""
        if self.executor:
            return await self.executor(command_obj)
        raise RuntimeError("No executor function set for ATCommandQueue")
    
    def set_executor(self, executor: Callable) -> None:
        """Set the executor function for commands."""
        self.executor = executor
    
    def clear(self) -> None:
        """Clear all queued commands."""
        logger.info(f"[ATQueue] Clearing queue ({len(self.queue)} commands)")
        for cmd in self.queue:
            if cmd._reject:
                cmd._reject(Exception("Queue cleared"))
        self.queue.clear()
        self.processing = False
        self.current_command = None
    
    def get_status(self) -> Dict[str, Any]:
        """Get current queue status."""
        return {
            "queueSize": len(self.queue),
            "processing": self.processing,
            "currentCommand": (
                self.current_command.command if self.current_command else None
            ),
        }
    
    def size(self) -> int:
        """Get current queue size."""
        return len(self.queue)
    
    def is_empty(self) -> bool:
        """Check if queue is empty."""
        return len(self.queue) == 0 and not self.processing

