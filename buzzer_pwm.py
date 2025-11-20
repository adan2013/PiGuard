#!/usr/bin/env python3

import time

import RPi.GPIO as GPIO

BUZZER_GPIO = 24  # BCM pin number
FREQUENCY_HZ = 2000  # tone frequency
DUTY_CYCLE = 50  # percent


def play_tone(pwm: GPIO.PWM, duration_s: float) -> None:
  pwm.start(DUTY_CYCLE)
  time.sleep(duration_s)
  pwm.stop()


def main() -> None:
  GPIO.setmode(GPIO.BCM)
  GPIO.setup(BUZZER_GPIO, GPIO.OUT)

  pwm = GPIO.PWM(BUZZER_GPIO, FREQUENCY_HZ)

  try:
    # Simple double quick beep: 150ms on, 100ms off, 150ms on
    play_tone(pwm, 0.15)
    time.sleep(0.10)
    play_tone(pwm, 0.15)

  finally:
    GPIO.output(BUZZER_GPIO, GPIO.LOW)
    GPIO.cleanup()


if __name__ == "__main__":
  main()


