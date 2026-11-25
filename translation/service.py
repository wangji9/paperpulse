"""Private, free English-to-Chinese API using the Argos OpenNMT model."""
import json, os, re, pathlib, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ctranslate2
import sentencepiece as spm

root = pathlib.Path(os.environ.get('MODEL_DIR', '/models'))
model_dir = next(root.glob('**/model.bin')).parent
tokenizer_file = next(root.glob('**/sentencepiece.model'))
tokenizer = spm.SentencePieceProcessor(model_file=str(tokenizer_file))
model = ctranslate2.Translator(str(model_dir), device='cpu', compute_type='int8', inter_threads=2, intra_threads=2)
slots = threading.Semaphore(2)

def translate(text):
    lines = text.split('\n')
    output = []
    with slots:
        for line in lines:
            if not line.strip(): output.append(''); continue
            parts = re.split(r'(?<=[.!?;])\s+(?=[A-Z])', line.strip())
            tokens = []
            for part in parts:
                encoded = tokenizer.encode(part, out_type=str)
                tokens.extend(encoded[i:i+200] for i in range(0, len(encoded), 200))
            batches = model.translate_batch(tokens, beam_size=4, max_batch_size=2048, batch_type='tokens', replace_unknowns=True, length_penalty=0.2)
            result = ''.join(tokenizer.decode(x.hypotheses[0]).replace('▁', ' ') for x in batches).strip()
            if re.search(r'\bagents?\b', text, re.I): result = result.replace('代理人', '智能体').replace('代理', '智能体')
            if re.search(r'\bdocuments?\b', text, re.I): result = result.replace('文件', '文档')
            if re.search(r'\b(reinforcement|policy|policies)\b', text, re.I): result = result.replace('政策', '策略')
            if re.search(r'\bmotion primitives?\b', text, re.I): result = result.replace('运动原始', '运动原语')
            if re.search(r'\bgrippers?\b', text, re.I): result = result.replace('发牢骚者', '夹爪')
            if re.search(r'\bforce\b', text, re.I): result = result.replace('武力', '力')
            if re.search(r'\blatent codebooks?\b', text, re.I): result = result.replace('潜伏密码本', '潜在码本')
            if re.search(r'\blibrary\b', text, re.I) and re.search(r'\b(policy|motion|robot)\b', text, re.I): result = result.replace('图书馆', '基元库')
            output.append(result)
    return '\n'.join(output)

class Handler(BaseHTTPRequestHandler):
    def respond(self, code, data):
        body=json.dumps(data,ensure_ascii=False).encode(); self.send_response(code)
        self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(body)))
        self.end_headers(); self.wfile.write(body)
    def do_GET(self): self.respond(200 if self.path=='/health' else 404, {'status':'ready','engine':'argos-en-zh-cpu'})
    def do_POST(self):
        try:
            length=int(self.headers.get('Content-Length','0'))
            if length>100000: self.respond(413,{'error':'输入过长'}); return
            data=json.loads(self.rfile.read(length)); source=data.get('q','')
            if not isinstance(source,str): self.respond(400,{'error':'q必须为字符串'}); return
            self.respond(200,{'translatedText':translate(source)})
        except Exception as error: self.respond(500,{'error':str(error)})
    def log_message(self, *args): pass

print('免费中英翻译服务已就绪', flush=True)
ThreadingHTTPServer(('0.0.0.0',8080),Handler).serve_forever()
