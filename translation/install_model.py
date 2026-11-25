"""Provision the free Argos en→zh model once, outside the Git repository."""
import hashlib
import io
import pathlib
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent / 'translation-models'
URLS = [
    'https://argos-net.com/v1/translate-en_zh-1_9.argosmodel',
    'https://huggingface.co/TiberiuCristianLeon/Argostranslate/resolve/da0645fca7c79794f632f394627a6784528006c9/translate-en_zh-1_9.argosmodel',
]
SHA256 = '433e7c4f034d87fbe2353161e05f18646d7999452f801a4e1f0378522b9850ab'

if (ROOT / 'translate-en_zh-1_9/model/model.bin').exists():
    print('翻译模型已安装')
else:
    for url in URLS:
        try:
            with urllib.request.urlopen(url, timeout=120) as response:
                data = response.read()
            if hashlib.sha256(data).hexdigest() != SHA256:
                raise ValueError('翻译模型校验失败')
            ROOT.mkdir(exist_ok=True)
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                for name in archive.namelist():
                    if not (ROOT / name).resolve().is_relative_to(ROOT.resolve()):
                        raise ValueError('模型路径不合法')
                archive.extractall(ROOT)
            print('免费中英翻译模型安装完成')
            break
        except Exception as error:
            print('模型源暂时不可用：', error)
    else:
        raise SystemExit('模型下载失败，请稍后重试。')
