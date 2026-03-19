#!/usr/bin/env python3
"""
MarkItDown Tool Wrapper

A utility wrapper for Microsoft's MarkItDown library providing:
- File conversion to Markdown with error handling
- Batch processing capabilities
- Integration with workspace file patterns
- Support for both local files and URLs

Usage:
    python markitdown_tool.py <input_file> [output_file]
    python markitdown_tool.py --batch <directory> [output_directory]
    python markitdown_tool.py --url <url> [output_file]

Requirements:
    pip install 'markitdown[all]'
"""

import argparse
import os
import sys
from pathlib import Path
from typing import Optional, Union

try:
    from markitdown import MarkItDown
except ImportError:
    print("Error: MarkItDown not installed. Run: pip install 'markitdown[all]'")
    sys.exit(1)


class MarkItDownTool:
    """Wrapper for MarkItDown with enhanced functionality for workspace integration."""
    
    def __init__(self, enable_plugins: bool = False):
        """Initialize the MarkItDown tool."""
        self.md = MarkItDown(enable_plugins=enable_plugins)
        
    def convert_file(self, input_path: Union[str, Path], output_path: Optional[Union[str, Path]] = None) -> str:
        """
        Convert a single file to Markdown.
        
        Args:
            input_path: Path to input file or URL
            output_path: Optional output file path
            
        Returns:
            Converted Markdown content
            
        Raises:
            FileNotFoundError: If input file doesn't exist
            Exception: If conversion fails
        """
        input_path = Path(input_path) if not str(input_path).startswith(('http://', 'https://')) else str(input_path)
        
        # Check if local file exists
        if isinstance(input_path, Path) and not input_path.exists():
            raise FileNotFoundError(f"Input file not found: {input_path}")
            
        try:
            print(f"Converting: {input_path}")
            result = self.md.convert(str(input_path))
            
            if not result or not result.text_content:
                raise ValueError("Conversion resulted in empty content")
                
            markdown_content = result.text_content
            
            # Write to output file if specified
            if output_path:
                output_path = Path(output_path)
                output_path.parent.mkdir(parents=True, exist_ok=True)
                output_path.write_text(markdown_content, encoding='utf-8')
                print(f"Output written to: {output_path}")
            
            return markdown_content
            
        except Exception as e:
            raise Exception(f"Failed to convert {input_path}: {str(e)}")
    
    def convert_batch(self, input_dir: Union[str, Path], output_dir: Optional[Union[str, Path]] = None) -> dict:
        """
        Convert multiple files in a directory to Markdown.
        
        Args:
            input_dir: Directory containing files to convert
            output_dir: Optional output directory
            
        Returns:
            Dictionary with conversion results
        """
        input_dir = Path(input_dir)
        if not input_dir.exists() or not input_dir.is_dir():
            raise ValueError(f"Input directory not found: {input_dir}")
            
        if output_dir:
            output_dir = Path(output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            
        # Supported file extensions based on MarkItDown documentation
        supported_extensions = {
            '.pdf', '.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls',
            '.html', '.htm', '.csv', '.json', '.xml', '.zip', '.epub',
            '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff',
            '.wav', '.mp3', '.msg'
        }
        
        results = {}
        files_to_convert = [
            f for f in input_dir.rglob('*') 
            if f.is_file() and f.suffix.lower() in supported_extensions
        ]
        
        print(f"Found {len(files_to_convert)} files to convert in {input_dir}")
        
        for file_path in files_to_convert:
            try:
                relative_path = file_path.relative_to(input_dir)
                
                if output_dir:
                    output_file = output_dir / relative_path.with_suffix('.md')
                    self.convert_file(file_path, output_file)
                    results[str(relative_path)] = {'status': 'success', 'output': str(output_file)}
                else:
                    content = self.convert_file(file_path)
                    results[str(relative_path)] = {'status': 'success', 'content': content}
                    
            except Exception as e:
                results[str(relative_path)] = {'status': 'error', 'error': str(e)}
                print(f"Error converting {relative_path}: {e}")
                
        return results


def main():
    """Main CLI interface."""
    parser = argparse.ArgumentParser(
        description="Convert files to Markdown using MarkItDown",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s document.pdf                           # Convert to stdout
  %(prog)s document.pdf output.md                 # Convert to file
  %(prog)s --batch ./docs/ ./docs_md/             # Batch convert directory
  %(prog)s --url https://example.com/doc.pdf      # Convert from URL
  %(prog)s --list-supported                       # Show supported formats
        """
    )
    
    parser.add_argument('input', nargs='?', help='Input file path or URL')
    parser.add_argument('output', nargs='?', help='Output file path (optional)')
    parser.add_argument('--batch', metavar='DIR', help='Batch convert directory')
    parser.add_argument('--url', metavar='URL', help='Convert from URL')
    parser.add_argument('--output-dir', metavar='DIR', help='Output directory for batch conversion')
    parser.add_argument('--plugins', action='store_true', help='Enable MarkItDown plugins')
    parser.add_argument('--list-supported', action='store_true', help='List supported file formats')
    
    args = parser.parse_args()
    
    if args.list_supported:
        print("Supported file formats:")
        formats = [
            "Documents: PDF, DOCX, DOC, PPTX, PPT, XLSX, XLS, HTML, EPUB",
            "Images: PNG, JPG, JPEG, GIF, BMP, TIFF (with OCR)",
            "Audio: WAV, MP3 (with transcription)",
            "Data: CSV, JSON, XML, ZIP",
            "Email: MSG (Outlook messages)",
            "Web: YouTube URLs"
        ]
        for fmt in formats:
            print(f"  {fmt}")
        return
    
    # Initialize tool
    tool = MarkItDownTool(enable_plugins=args.plugins)
    
    try:
        if args.batch:
            # Batch conversion
            results = tool.convert_batch(args.batch, args.output_dir)
            successful = sum(1 for r in results.values() if r['status'] == 'success')
            total = len(results)
            print(f"\nBatch conversion completed: {successful}/{total} files successful")
            
        elif args.url:
            # URL conversion
            content = tool.convert_file(args.url, args.output)
            if not args.output:
                print(content)
                
        elif args.input:
            # Single file conversion
            content = tool.convert_file(args.input, args.output)
            if not args.output:
                print(content)
                
        else:
            parser.print_help()
            
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
