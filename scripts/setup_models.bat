@echo off
REM Pull the models Haifa HiveMind needs. Run once after installing Ollama.
echo ==^> Pulling chat + vision model (Qwen2.5-VL 7B)...
ollama pull qwen2.5vl:7b
echo ==^> Pulling embedding model (nomic-embed-text)...
ollama pull nomic-embed-text
echo ==^> Done. Models ready.
pause
