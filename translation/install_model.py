"""Install the local, GPU-backed academic translation model (no cloud key)."""
import pathlib, subprocess
root=pathlib.Path(__file__).resolve().parent.parent
subprocess.run(['docker','compose','up','-d','translation-llm'],cwd=root,check=True)
subprocess.run(['docker','compose','exec','-T','translation-llm','ollama','pull','qwen3:4b-instruct-2507-q4_K_M'],cwd=root,check=True)
