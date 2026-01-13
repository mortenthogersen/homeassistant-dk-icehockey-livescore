#!/bin/bash
# Bash script to download team logos
# Run this script from the project root directory

BASE_URL="https://den.hokejovyzapis.cz/img/logos"
OUTPUT_DIR="team-logos"

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"
echo "Created directory: $OUTPUT_DIR"

# Download logos for teams 1-9
for i in {1..9}; do
    URL="$BASE_URL/$i.png"
    OUTPUT_FILE="$OUTPUT_DIR/$i.png"
    
    echo "Downloading logo $i.png..."
    if curl -f -s "$URL" -o "$OUTPUT_FILE"; then
        echo "  ✓ Saved to $OUTPUT_FILE"
    else
        echo "  ✗ Failed to download $URL" >&2
    fi
done

echo ""
echo "Download complete! Copy the 'team-logos' folder to your Home Assistant www directory."
echo "The logos will be accessible at: /local/team-logos/1.png, /local/team-logos/2.png, etc."
