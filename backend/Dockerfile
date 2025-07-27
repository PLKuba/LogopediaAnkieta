# Use the official Python slim image
FROM python:3.12.3-slim

# Set a working directory
WORKDIR /app

# Install system deps (if any), then Python requirements
# (Add apt-get lines here if you need ffmpeg, libpq-dev, etc.)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy your application code
COPY . .

# Expose the port your app listens on
EXPOSE 8080

# Run the app via Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
