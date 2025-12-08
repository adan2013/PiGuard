#!/usr/bin/env python3

import sys
import time

import RPi.GPIO as GPIO

DEFAULT_FREQUENCY_HZ = 2000
DUTY_CYCLE = 50

# Melody notes (relative to default frequency)
MELODY_UP_NOTES = [0.75, 0.9, 1.1, 1.3, 1.5]
MELODY_DOWN_NOTES = [1.5, 1.3, 1.1, 0.9, 0.75]


def play_tone(pwm: GPIO.PWM, duration_s: float, frequency_hz: int) -> None:
  pwm.ChangeFrequency(frequency_hz)
  pwm.ChangeDutyCycle(DUTY_CYCLE)
  time.sleep(duration_s)
  pwm.ChangeDutyCycle(0)


def single_beep(pwm: GPIO.PWM) -> None:
  play_tone(pwm, 0.15, DEFAULT_FREQUENCY_HZ)


def double_beep(pwm: GPIO.PWM) -> None:
  single_beep(pwm)
  time.sleep(0.1)
  single_beep(pwm)


def long_beep(pwm: GPIO.PWM) -> None:
  play_tone(pwm, 1.0, DEFAULT_FREQUENCY_HZ)


def melody_up(pwm: GPIO.PWM) -> None:
  for multiplier in MELODY_UP_NOTES:
    freq = int(DEFAULT_FREQUENCY_HZ * multiplier)
    play_tone(pwm, 0.12, freq)
    time.sleep(0.03)
  time.sleep(1.0)  # 1 second gap
  for multiplier in MELODY_UP_NOTES:
    freq = int(DEFAULT_FREQUENCY_HZ * multiplier)
    play_tone(pwm, 0.12, freq)
    time.sleep(0.03)


def melody_down(pwm: GPIO.PWM) -> None:
  for multiplier in MELODY_DOWN_NOTES:
    freq = int(DEFAULT_FREQUENCY_HZ * multiplier)
    play_tone(pwm, 0.12, freq)
    time.sleep(0.03)


def main() -> None:
  if len(sys.argv) < 3:
    print("Usage: playSound.py <gpio_number> <sound_type>")
    print("Sound types: single, double, long, melody_up, melody_down")
    sys.exit(1)

  try:
    gpio_number = int(sys.argv[1])
  except ValueError:
    print(f"Error: Invalid GPIO number '{sys.argv[1]}'")
    sys.exit(1)

  sound_type = sys.argv[2].lower()

  GPIO.setmode(GPIO.BCM)
  GPIO.setwarnings(False)
  GPIO.setup(gpio_number, GPIO.OUT)

  pwm = None
  try:
    pwm = GPIO.PWM(gpio_number, DEFAULT_FREQUENCY_HZ)
    pwm.start(0)

    if sound_type == "single":
      single_beep(pwm)
    elif sound_type == "double":
      double_beep(pwm)
    elif sound_type == "long":
      long_beep(pwm)
    elif sound_type == "melody_up":
      melody_up(pwm)
    elif sound_type == "melody_down":
      melody_down(pwm)
    else:
      print(f"Unknown sound type '{sound_type}'. Use one of: single, double, long, melody_up, melody_down")
      sys.exit(1)

  finally:
    if pwm is not None:
      try:
        pwm.ChangeDutyCycle(0)
      except:
        pass
      try:
        pwm.stop()
      except:
        pass
      del pwm
    GPIO.cleanup(gpio_number)


if __name__ == "__main__":
  main()

