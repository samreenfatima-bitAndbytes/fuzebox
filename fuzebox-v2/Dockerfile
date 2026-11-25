FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including Nginx
RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    nginx \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Copy Nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Make startup script executable
RUN chmod +x start.sh

EXPOSE 80

CMD ["./start.sh"]
