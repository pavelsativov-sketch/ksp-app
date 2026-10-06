import fitz, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
doc = fitz.open(sys.argv[1])
for i, page in enumerate(doc):
    print(f"--- PAGE {i+1} ---")
    for b in page.get_text("blocks"):
        print(b[4].strip())
        print("~~~")
