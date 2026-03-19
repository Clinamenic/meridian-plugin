# MarkItDown Integration Guide

This document provides a comprehensive overview of MarkItDown integration options available in this workspace.

## Overview

Microsoft's MarkItDown is a powerful utility for converting various document formats to Markdown, specifically optimized for LLM consumption. This workspace provides multiple integration approaches to suit different AI assistants and use cases.

## Integration Options

### 1. MCP Integration (Claude Desktop)

**Location**: `.workspace/mcp/`
**Best for**: Interactive Claude Desktop sessions
**Setup**: Run `.workspace/mcp/scripts/setup.sh`

**Features:**
- Docker-based isolation
- Automatic volume mounting
- Built-in debugging tools
- Ready-to-use Claude Desktop configuration

**Usage in Claude:**
```
convert_to_markdown("https://example.com/document.pdf")
convert_to_markdown("file:///workdir/workspace/local-file.docx")
```

### 2. Direct Installation (Cursor & Others)

**Location**: `.workspace/scripts/markitdown/`
**Best for**: Cursor, automation scripts, programmatic access
**Setup**: Run `.workspace/scripts/markitdown/setup_markitdown.sh`

**Features:**
- No Docker dependency
- Direct CLI access
- Python API wrapper
- Batch processing
- Virtual environment support

**Usage:**
```bash
# CLI
markitdown document.pdf -o output.md

# Wrapper tool
python3 .workspace/scripts/markitdown/markitdown_tool.py document.pdf output.md

# Batch processing
python3 .workspace/scripts/markitdown/markitdown_tool.py --batch ./docs/ ./docs_md/
```

### 3. Hybrid Approach

You can use both approaches simultaneously:
- MCP for Claude Desktop interactive sessions
- Direct installation for Cursor and automation

## Supported Formats

MarkItDown supports comprehensive format conversion:

| Category | Formats | Features |
|----------|---------|----------|
| **Documents** | PDF, DOCX, DOC, PPTX, PPT, XLSX, XLS, HTML, EPubs | Structure preservation |
| **Media** | PNG, JPG, GIF, BMP, TIFF | OCR text extraction |
| **Audio** | WAV, MP3 | Speech transcription |
| **Data** | CSV, JSON, XML | Structured data parsing |
| **Archives** | ZIP files | Content iteration |
| **Email** | MSG (Outlook) | Message parsing |
| **Web** | URLs, YouTube | Content extraction |

## Configuration Rules

The workspace includes Cursor rule `030_markdown_conversion.mdc` that defines:
- Tool selection guidelines
- Usage patterns
- Best practices
- Installation options

## Quick Start

### For Claude Desktop Users
```bash
cd .workspace/mcp
./scripts/setup.sh
# Follow prompts to configure Claude Desktop
```

### For Cursor Users
```bash
cd .workspace/scripts/markitdown
./setup_markitdown.sh
# Choose installation option
```

### For Both
Set up both options for maximum flexibility across different AI assistants.

## Usage Examples

### PDF Research Papers
```bash
# Convert arXiv paper
markitdown https://arxiv.org/pdf/2301.00001.pdf -o research.md
```

### Office Documents
```bash
# Convert presentations
python3 .workspace/scripts/markitdown/markitdown_tool.py presentation.pptx slides.md

# Batch convert documents
python3 .workspace/scripts/markitdown/markitdown_tool.py --batch ./documents/ ./markdown/
```

### Images and Screenshots
```bash
# Extract text from screenshots
markitdown screenshot.png -o extracted-text.md
```

### Web Content
```bash
# Convert web articles
markitdown https://blog.example.com/article -o article.md

# Get YouTube transcripts (MCP)
convert_to_markdown("https://www.youtube.com/watch?v=VIDEO_ID")
```

## Best Practices

1. **File Paths**: Use absolute paths when possible
2. **Batch Processing**: Use wrapper tool for multiple files
3. **Error Handling**: Check conversion success before proceeding
4. **Format Selection**: Choose appropriate installation based on needs
5. **Documentation**: Include conversion context in output

## Troubleshooting

### Common Issues

1. **Installation Problems**
   - Ensure Python 3.10+ is installed
   - Use virtual environments to avoid conflicts
   - Check pip version and update if needed

2. **Claude Desktop Integration**
   - Verify JSON syntax in configuration
   - Restart Claude Desktop completely after config changes
   - Check volume mount paths match your system

3. **File Access Issues**
   - Use correct path prefixes (`file:///workdir/` for MCP)
   - Ensure files are readable by the conversion process
   - Check Docker volume mounts for MCP setup

4. **Conversion Failures**
   - Verify file format is supported
   - Check file integrity and accessibility
   - Review error messages for specific issues

### Getting Help

1. **View logs**: `.workspace/mcp/scripts/logs.sh` (MCP)
2. **Test installation**: `markitdown --help` (direct)
3. **Debug mode**: `.workspace/mcp/scripts/debug.sh` (MCP)
4. **Check supported formats**: `python3 .workspace/scripts/markitdown/markitdown_tool.py --list-supported`

## Future Enhancements

Consider adding:
- Azure Document Intelligence integration
- Custom LLM model support for image descriptions
- Automated batch processing workflows
- Integration with other MCP servers
- Performance optimization for large files

## Security Considerations

- Docker containers run with non-root users
- Volume mounts are read-only where possible
- Virtual environments isolate dependencies
- Network access controlled through Docker networking

This integration provides flexible, powerful document conversion capabilities suitable for various AI assistant workflows while maintaining security and ease of use.
