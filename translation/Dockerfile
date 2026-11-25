FROM docker.m.daocloud.io/library/python:3.11-slim
WORKDIR /service
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple "ctranslate2>=4.4,<5" "sentencepiece>=0.2,<0.3"
COPY service.py /service/service.py
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=5 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=3)"
CMD ["python", "-u", "/service/service.py"]
