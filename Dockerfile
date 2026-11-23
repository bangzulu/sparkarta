# Realtidsservern för spårkartan (Fly.io). Statisk GTFS cachas på volymen /data.
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py network.json ./
COPY public ./public
ENV CACHE_DIR=/data PORT=8080 PYTHONUNBUFFERED=1
EXPOSE 8080
CMD ["python3", "server.py"]
