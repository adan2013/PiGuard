#!/usr/bin/env python3

import sys
import time

import RPi.GPIO as GPIO

BUZZER_GPIO = 24
DEFAULT_FREQUENCY_HZ = 2000
DUTY_CYCLE = 50


def play_tone(pwm: GPIO.PWM, duration_s: float, frequency_hz: int) -> None:
  pwm.ChangeFrequency(frequency_hz)
  pwm.ChangeDutyCycle(DUTY_CYCLE)
  time.sleep(duration_s)
  pwm.ChangeDutyCycle(0)


def single_beep(pwm: GPIO.PWM) -> None:
  play_tone(pwm, 0.15, DEFAULT_FREQUENCY_HZ)

def melody_up(pwm: GPIO.PWM) -> None:
  notes = [
    int(DEFAULT_FREQUENCY_HZ * 0.75),
    int(DEFAULT_FREQUENCY_HZ * 0.9),
    int(DEFAULT_FREQUENCY_HZ * 1.1),
    int(DEFAULT_FREQUENCY_HZ * 1.3),
    int(DEFAULT_FREQUENCY_HZ * 1.5),
  ]
  for freq in notes:
    play_tone(pwm, 0.12, freq)
    time.sleep(0.03)


def main() -> None:
  if len(sys.argv) < 2:
    print("Usage: buzzer_pwm.py [single|double|melody]")
    sys.exit(1)

  mode = sys.argv[1].lower()

  GPIO.setmode(GPIO.BCM)
  GPIO.setwarnings(False)
  GPIO.setup(BUZZER_GPIO, GPIO.OUT)

  pwm = None
  try:
    pwm = GPIO.PWM(BUZZER_GPIO, DEFAULT_FREQUENCY_HZ)
    pwm.start(0)

    if mode == "single":
      single_beep(pwm)
    elif mode == "double":
      single_beep(pwm)
      time.sleep(0.1)
      single_beep(pwm)
    elif mode == "melody":
      melody_up(pwm)
      time.sleep(1)
      melody_up(pwm)
    else:
      print("Unknown mode. Use one of: single, double, melody")

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
    GPIO.cleanup(BUZZER_GPIO)


if __name__ == "__main__":
  main()


