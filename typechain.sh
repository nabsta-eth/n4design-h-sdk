#!/bin/sh
# Copy dependency ABIs into the ./src/abi folder.
if [ -z "${SKIP_INTERNAL_ABI_COPY}" ]; then
  yarn add --dev @handle-fi/handle-psm @handle-fi/handle-routes
  node copyInternalAbis.js
  yarn --ignore-scripts
fi
# Generate types.
npx typechain --target=ethers-v5 \
  --out-dir ./src/contracts \
  "./src/abis/**/*.json"
if [ -z "${SKIP_INTERNAL_ABI_COPY}" ]; then
  yarn remove @handle-fi/handle-psm @handle-fi/handle-routes
fi
