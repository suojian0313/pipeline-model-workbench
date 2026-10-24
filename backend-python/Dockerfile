FROM python:3.12-slim
RUN pip install --no-cache-dir uv
WORKDIR /app/backend-python
COPY backend-python/pyproject.toml backend-python/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY backend-python/app ./app
COPY shared /app/shared
ENV PATH="/app/backend-python/.venv/bin:$PATH" PYTHONUNBUFFERED=1 PYTHONUTF8=1
EXPOSE 3002
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3002"]
