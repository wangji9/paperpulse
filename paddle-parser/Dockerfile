FROM docker.m.daocloud.io/library/python:3.11-slim

ENV PYTHONUNBUFFERED=1
ENV PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
ENV OMP_NUM_THREADS=16
ENV MKL_NUM_THREADS=16
ENV FLAGS_use_mkldnn=0

WORKDIR /service

RUN sed -i 's|http://deb.debian.org|http://mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl libgomp1 libglib2.0-0 libgl1 libsm6 libxext6 libxrender1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple \
    paddlepaddle \
    paddleocr \
    pymupdf \
    pillow \
    numpy

COPY service.py /service/service.py

EXPOSE 8090

HEALTHCHECK --interval=20s --timeout=6s --start-period=120s --retries=8 \
  CMD curl -fsS http://127.0.0.1:8090/health || exit 1

CMD ["python", "-u", "/service/service.py"]
