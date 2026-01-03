# 🚀 PocketBench

**PocketBench** is a local automation tool for benchmarking Quantized LLMs (GGUF). 

It allows you to queue up multiple models, run benchmarks (like MMLU, GSM8k) overnight, and automatically sync the results to a community leaderboard.

## ✨ Features
- **Batch Processing**: Queue multiple models and run them sequentially.
- **Fault Tolerance**: Automatically retries if a model crashes or internet fails.
- **Disk Cleaner**: Finds and deletes corrupted or partial downloads to save space.
- **Leaderboard Sync**: Auto-uploads results to Hugging Face.

## 🛠️ Installation

**1. Clone the repository**
```bash
git clone [https://github.com/sidhu1512/PocketBench.git](https://github.com/sidhu1512/PocketBench.git)
cd PocketBench