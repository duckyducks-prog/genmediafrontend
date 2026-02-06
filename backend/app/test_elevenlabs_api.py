import os
import requests
from dotenv import load_dotenv

# Load environment variables from .env.development
load_dotenv(dotenv_path="../.env.development")

API_KEY = os.getenv("ELEVENLABS_API_KEY")

if not API_KEY:
    print("Missing ELEVENLABS_API_KEY in environment.")
    exit(1)

# Example endpoint for ElevenLabs (replace with actual endpoint if needed)
url = "https://api.elevenlabs.io/v1/music/generate"
headers = {
    "xi-api-key": API_KEY,
    "Content-Type": "application/json"
}
data = {
    "prompt": "Test music generation",
    "duration": 5
}

response = requests.post(url, json=data, headers=headers)

print(f"Status: {response.status_code}")
print(f"Response: {response.text}")
