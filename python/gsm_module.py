"""GSM module for sending SMS via serial communication."""
import asyncio
import logging
import serial
import serial.tools.list_ports
from typing import Optional, List, Dict, Any
from config import Config
from at_command_queue import ATCommandQueue, CommandObject

logger = logging.getLogger(__name__)


class GSMModule:
    """Manages GSM module communication via serial port."""
    
    def __init__(self, config: Config):
        self.config = config
        self.port: Optional[serial.Serial] = None
        self.response_buffer: str = ""
        self.command_queue: ATCommandQueue = ATCommandQueue(
            config.at_command_timeout, config.at_command_retry
        )
        self.is_ready: bool = False
        self.pending_command: Optional[CommandObject] = None
        self.pending_future: Optional[asyncio.Future] = None
        
        # Set executor for command queue
        self.command_queue.set_executor(self._execute_at_command)
    
    async def initialize(self) -> bool:
        """Initialize the GSM module."""
        logger.info("[GSM] Initializing GSM module...")
        
        try:
            serial_config = self.config.get_serial_config()
            self.port = serial.Serial(
                port=serial_config["path"],
                baudrate=serial_config["baudrate"],
                timeout=1,
            )
            
            # Start response reader task
            asyncio.create_task(self._read_responses())
            
            logger.info("[GSM] Serial port opened successfully")
            
            await asyncio.sleep(2)
            
            await self._send_command("AT", "OK")
            await self._send_command("ATE0", "OK")
            await self._send_command("AT+CMGF=1", "OK")
            await self._send_command("AT+CNMI=1,2,0,0,0", "OK")
            
            await self._check_network_registration()
            
            self.is_ready = True
            logger.info("[GSM] GSM module initialized successfully")
            
            return True
        except Exception as error:
            error_message = str(error)
            logger.error(f"[GSM] Initialization failed: {error_message}")
            raise
    
    async def _read_responses(self) -> None:
        """Continuously read responses from serial port."""
        while self.port and self.port.is_open:
            try:
                if self.port.in_waiting > 0:
                    data = self.port.readline().decode("utf-8", errors="ignore")
                    data = data.strip()
                    if data:
                        await self._handle_response(data)
                await asyncio.sleep(0.1)
            except Exception as e:
                logger.error(f"[GSM] Error reading response: {e}")
                await asyncio.sleep(0.5)
    
    async def _handle_response(self, data: str) -> None:
        """Handle incoming response data."""
        trimmed_data = data.strip()
        
        if not trimmed_data:
            return
        
        logger.info(f"[GSM] << {trimmed_data}")
        
        self.response_buffer += trimmed_data + "\n"
        
        if self.pending_command and self.pending_future:
            expected_response = self.pending_command.expected_response
            
            if "ERROR" in trimmed_data or "FAIL" in trimmed_data:
                self.pending_command = None
                if not self.pending_future.done():
                    self.pending_future.set_exception(Exception(trimmed_data))
                self.pending_future = None
                self.response_buffer = ""
                return
            
            if expected_response in trimmed_data or trimmed_data == expected_response:
                response = self.response_buffer
                self.response_buffer = ""
                self.pending_command = None
                if not self.pending_future.done():
                    self.pending_future.set_result(response)
                self.pending_future = None
                return
            
            if expected_response == ">" and trimmed_data == ">":
                self.response_buffer = ""
                self.pending_command = None
                if not self.pending_future.done():
                    self.pending_future.set_result(">")
                self.pending_future = None
                return
    
    async def _send_command(
        self, command: str, expected_response: str = "OK"
    ) -> str:
        """Send a command via the command queue."""
        if not self.port or not self.port.is_open:
            raise RuntimeError("Serial port not open")
        
        return await self.command_queue.add(command, expected_response)
    
    async def _execute_at_command(self, command_obj: CommandObject) -> str:
        """Execute an AT command and wait for response."""
        loop = asyncio.get_event_loop()
        future = loop.create_future()
        
        command = command_obj.command
        expected_response = command_obj.expected_response
        
        logger.info(f"[GSM] >> {command}")
        
        self.response_buffer = ""
        self.pending_command = command_obj
        self.pending_future = future
        
        # Set timeout
        timeout_handle = asyncio.create_task(
            self._command_timeout(command, future)
        )
        
        try:
            # Write command to serial port
            self.port.write((command + "\r\n").encode())
            
            # Wait for response
            result = await future
            timeout_handle.cancel()
            return result
        except Exception as e:
            timeout_handle.cancel()
            self.pending_command = None
            self.pending_future = None
            raise
    
    async def _command_timeout(
        self, command: str, future: asyncio.Future
    ) -> None:
        """Handle command timeout."""
        await asyncio.sleep(self.config.at_command_timeout / 1000.0)
        if not future.done():
            self.pending_command = None
            self.pending_future = None
            future.set_exception(
                TimeoutError(f"Command timeout: {command}")
            )
    
    async def send_sms(self, phone_number: str, message: str) -> bool:
        """Send an SMS message."""
        if not self.is_ready:
            raise RuntimeError("GSM module not ready")
        
        logger.info(f"[GSM] Sending SMS to {phone_number}: {message}")
        
        try:
            await self._send_command(f'AT+CMGS="{phone_number}"', ">")
            await asyncio.sleep(0.5)
            
            # Send message with Ctrl+Z terminator
            await self._execute_at_command(
                CommandObject(
                    command=message + chr(26),
                    expected_response="OK",
                )
            )
            
            logger.info(f"[GSM] SMS sent successfully to {phone_number}")
            return True
        except Exception as error:
            error_message = str(error)
            logger.error(
                f"[GSM] Failed to send SMS to {phone_number}: {error_message}"
            )
            raise
    
    async def send_alert(self, trigger_name: str) -> List[Dict[str, Any]]:
        """Send alert SMS to all configured phone numbers."""
        phone_numbers = self.config.get_phone_numbers()
        
        if not phone_numbers:
            return []
        
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        message = f"ALERT: {trigger_name} triggered at {timestamp}"
        
        logger.info(f"[GSM] Sending alert: {message}")
        
        results = []
        
        for phone_number in phone_numbers:
            try:
                await self.send_sms(phone_number, message)
                results.append({"phoneNumber": phone_number, "success": True})
            except Exception as error:
                error_message = str(error)
                logger.error(
                    f"[GSM] Failed to send alert to {phone_number}: "
                    f"{error_message}"
                )
                results.append({
                    "phoneNumber": phone_number,
                    "success": False,
                    "error": error_message,
                })
        
        return results
    
    async def close(self) -> None:
        """Close the GSM module."""
        logger.info("[GSM] Closing GSM module...")
        
        self.command_queue.clear()
        
        if self.port and self.port.is_open:
            self.port.close()
        
        self.is_ready = False
        logger.info("[GSM] GSM module closed")
    
    async def _check_network_registration(self) -> None:
        """Check network registration status."""
        try:
            await self._send_command("AT+CREG?", "OK")
        except Exception:
            pass  # Ignore errors during registration check
    
    def get_status(self) -> Dict[str, Any]:
        """Get GSM module status."""
        return {
            "isReady": self.is_ready,
            "portOpen": self.port.is_open if self.port else False,
            "queueStatus": self.command_queue.get_status(),
        }

