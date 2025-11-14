"""Configuration management for PiGuard."""
import os
from typing import Dict, List
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Manages PiGuard configuration from environment variables."""
    
    def __init__(self):
        self.serial_port: str = os.getenv("SERIAL_PORT", "/dev/ttyUSB0")
        self.serial_baudrate: int = int(os.getenv("SERIAL_BAUDRATE", "9600"))
        
        self.gpio_pins: Dict[str, int] = {
            "trigger1": int(os.getenv("GPIO_TRIGGER_1", "17")),
            "trigger2": int(os.getenv("GPIO_TRIGGER_2", "27")),
            "trigger3": int(os.getenv("GPIO_TRIGGER_3", "22")),
        }
        
        self.trigger_names: Dict[str, str] = {
            "trigger1": os.getenv("TRIGGER_1_NAME", "Trigger 1"),
            "trigger2": os.getenv("TRIGGER_2_NAME", "Trigger 2"),
            "trigger3": os.getenv("TRIGGER_3_NAME", "Trigger 3"),
        }
        
        self.phone_numbers: List[str] = self._parse_phone_numbers(
            os.getenv("PHONE_NUMBERS", "")
        )
        
        self.at_command_timeout: int = int(os.getenv("AT_COMMAND_TIMEOUT", "5000"))
        self.at_command_retry: int = int(os.getenv("AT_COMMAND_RETRY", "3"))
        
        self._validate()
    
    def _parse_phone_numbers(self, numbers_string: str) -> List[str]:
        """Parse comma-separated phone numbers."""
        if not numbers_string:
            return []
        return [
            num.strip() for num in numbers_string.split(",") if num.strip()
        ]
    
    def _validate(self) -> None:
        """Validate configuration values."""
        if not self.serial_port:
            raise ValueError("SERIAL_PORT is required in configuration")
        
        if not self.phone_numbers:
            print(
                "WARNING: No phone numbers configured. SMS alerts will not be sent."
            )
        
        if self.serial_baudrate <= 0:
            raise ValueError("Invalid SERIAL_BAUDRATE configuration")
        
        for key, pin in self.gpio_pins.items():
            if pin < 0:
                raise ValueError(f"Invalid GPIO pin configuration for {key}: {pin}")
    
    def get_serial_config(self) -> Dict[str, any]:
        """Get serial port configuration."""
        return {
            "path": self.serial_port,
            "baudrate": self.serial_baudrate,
        }
    
    def get_gpio_config(self) -> Dict[str, int]:
        """Get GPIO pin configuration."""
        return self.gpio_pins
    
    def get_trigger_name(self, trigger_key: str) -> str:
        """Get trigger name by key."""
        return self.trigger_names.get(trigger_key, "Unknown Trigger")
    
    def get_phone_numbers(self) -> List[str]:
        """Get list of phone numbers."""
        return self.phone_numbers
    
    def display(self) -> None:
        """Display current configuration."""
        print("\n=== PiGuard Configuration ===")
        print(f"Serial Port: {self.serial_port}")
        print(f"Baud Rate: {self.serial_baudrate}")
        print("\nGPIO Pins:")
        print(
            f"  Trigger 1 ({self.trigger_names['trigger1']}): "
            f"GPIO {self.gpio_pins['trigger1']}"
        )
        print(
            f"  Trigger 2 ({self.trigger_names['trigger2']}): "
            f"GPIO {self.gpio_pins['trigger2']}"
        )
        print(
            f"  Trigger 3 ({self.trigger_names['trigger3']}): "
            f"GPIO {self.gpio_pins['trigger3']}"
        )
        print(f"\nPhone Numbers: {', '.join(self.phone_numbers)}")
        print(f"AT Command Timeout: {self.at_command_timeout}ms")
        print(f"AT Command Retry: {self.at_command_retry}")
        print("=============================\n")

