import os
import sys

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SV_DIR = os.path.join(ROOT_DIR, "sv")
if SV_DIR not in sys.path:
    sys.path.insert(0, SV_DIR)

from app import app
