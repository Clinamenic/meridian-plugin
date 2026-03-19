#!/bin/bash

# MarkItDown Setup Script
# Installs MarkItDown with all dependencies for document conversion

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}MarkItDown Setup${NC}"
echo "========================================"
echo "Workspace: $WORKSPACE_DIR"
echo ""

# Check Python installation
echo -e "${YELLOW}Checking Python installation...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: Python 3 is not installed${NC}"
    echo "Please install Python 3.10 or higher"
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
REQUIRED_VERSION="3.10"

if python3 -c "import sys; exit(0 if sys.version_info >= (3, 10) else 1)"; then
    echo -e "${GREEN}Python $PYTHON_VERSION detected (>= 3.10 required)${NC}"
else
    echo -e "${RED}Error: Python $PYTHON_VERSION is too old. Python 3.10+ required.${NC}"
    exit 1
fi

# Check if pip is available
if ! command -v pip3 &> /dev/null; then
    echo -e "${RED}Error: pip3 is not available${NC}"
    echo "Please install pip3"
    exit 1
fi

echo ""

# Installation options
echo -e "${YELLOW}MarkItDown Installation Options:${NC}"
echo "1. Full installation (all format support)"
echo "2. Selective installation (PDF, DOCX, PPTX only)"
echo "3. Minimal installation (basic formats only)"
echo "4. Check if already installed"
echo ""

read -p "Choose installation option (1-4): " -n 1 -r
echo
echo ""

case $REPLY in
    1)
        echo -e "${YELLOW}Installing MarkItDown with all dependencies...${NC}"
        INSTALL_CMD="pip3 install 'markitdown[all]'"
        ;;
    2)
        echo -e "${YELLOW}Installing MarkItDown with selective dependencies...${NC}"
        INSTALL_CMD="pip3 install 'markitdown[pdf,docx,pptx,xlsx,audio-transcription]'"
        ;;
    3)
        echo -e "${YELLOW}Installing minimal MarkItDown...${NC}"
        INSTALL_CMD="pip3 install markitdown"
        ;;
    4)
        echo -e "${YELLOW}Checking current installation...${NC}"
        if python3 -c "import markitdown; print('MarkItDown version:', markitdown.__version__)" 2>/dev/null; then
            echo -e "${GREEN}MarkItDown is already installed${NC}"
            
            # Test the installation
            echo ""
            echo -e "${YELLOW}Testing installation...${NC}"
            if python3 "$SCRIPT_DIR/markitdown_tool.py" --list-supported &>/dev/null; then
                echo -e "${GREEN}MarkItDown tool is working correctly${NC}"
            else
                echo -e "${RED}MarkItDown tool test failed${NC}"
            fi
            
            # Test CLI
            if command -v markitdown &> /dev/null; then
                echo -e "${GREEN}MarkItDown CLI is available${NC}"
                markitdown --help | head -3
            else
                echo -e "${YELLOW}MarkItDown CLI not found in PATH${NC}"
            fi
            
            exit 0
        else
            echo -e "${RED}MarkItDown is not installed${NC}"
            exit 1
        fi
        ;;
    *)
        echo -e "${RED}Invalid option${NC}"
        exit 1
        ;;
esac

# Create virtual environment option
echo "Do you want to install in a virtual environment? (recommended)"
read -p "(y/N): " -n 1 -r
echo
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    VENV_DIR="$WORKSPACE_DIR/.venv-markitdown"
    
    if [ -d "$VENV_DIR" ]; then
        echo -e "${YELLOW}Virtual environment already exists at $VENV_DIR${NC}"
        read -p "Do you want to recreate it? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$VENV_DIR"
        else
            echo "Using existing virtual environment"
        fi
    fi
    
    if [ ! -d "$VENV_DIR" ]; then
        echo -e "${YELLOW}Creating virtual environment...${NC}"
        python3 -m venv "$VENV_DIR"
    fi
    
    echo -e "${YELLOW}Activating virtual environment...${NC}"
    source "$VENV_DIR/bin/activate"
    
    # Upgrade pip
    pip install --upgrade pip
    
    # Update install command to use activated pip
    INSTALL_CMD=${INSTALL_CMD/pip3/pip}
fi

# Install MarkItDown
echo -e "${YELLOW}Running: $INSTALL_CMD${NC}"
eval $INSTALL_CMD

echo ""
echo -e "${GREEN}Installation completed successfully!${NC}"

# Test the installation
echo ""
echo -e "${YELLOW}Testing installation...${NC}"

# Test Python import
if python3 -c "import markitdown; print('MarkItDown version:', markitdown.__version__)" 2>/dev/null; then
    echo -e "${GREEN}✓ Python import successful${NC}"
else
    echo -e "${RED}✗ Python import failed${NC}"
fi

# Test CLI
if command -v markitdown &> /dev/null; then
    echo -e "${GREEN}✓ CLI command available${NC}"
else
    echo -e "${YELLOW}! CLI command not in PATH (this is normal for venv installs)${NC}"
fi

# Test our wrapper tool
if python3 "$SCRIPT_DIR/markitdown_tool.py" --list-supported &>/dev/null; then
    echo -e "${GREEN}✓ Wrapper tool working${NC}"
else
    echo -e "${RED}✗ Wrapper tool failed${NC}"
fi

echo ""
echo -e "${BLUE}Next Steps:${NC}"

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "1. To use MarkItDown, activate the virtual environment:"
    echo "   source $VENV_DIR/bin/activate"
    echo ""
fi

echo "2. Use the wrapper tool:"
echo "   python3 .workspace/scripts/markitdown/markitdown_tool.py file.pdf output.md"
echo ""

echo "3. Or use the CLI directly:"
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "   source $VENV_DIR/bin/activate && markitdown file.pdf"
else
    echo "   markitdown file.pdf"
fi
echo ""

echo "4. For Claude Desktop MCP integration:"
echo "   cd .workspace/mcp && ./scripts/setup.sh"
echo ""

echo -e "${GREEN}Setup completed!${NC}"
