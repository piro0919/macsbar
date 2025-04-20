#!/bin/bash
set -e

SRC_DIR="swift-src"
OUT_DIR="dist"
BINARIES=("app_observer")

mkdir -p "$OUT_DIR"

echo "🔨 Compiling Swift CLIs..."
for BIN in "${BINARIES[@]}"; do
  swiftc "$SRC_DIR/$BIN.swift" -o "$OUT_DIR/$BIN"
done

echo "✅ Swift CLIs built in $OUT_DIR/"