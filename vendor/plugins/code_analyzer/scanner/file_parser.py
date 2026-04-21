"""File parser for reading and preprocessing source code."""

from pathlib import Path
from typing import Optional, Dict


class FileParser:
    """Parse and preprocess source files for analysis."""

    def __init__(self):
        self._cache: Dict[str, str] = {}

    def parse(self, file_path: str) -> Optional[str]:
        """Read and preprocess file content.

        Args:
            file_path: Path to source file

        Returns:
            Preprocessed file content or None if read fails
        """
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            return self._preprocess(content, file_path)
        except (IOError, OSError):
            return None

    def _preprocess(self, content: str, file_path: str) -> str:
        """Preprocess content: remove comments, normalize whitespace."""
        # Store in cache
        self._cache[file_path] = content

        # Remove single-line comments
        content = self._remove_single_line_comments(content)
        # Remove multi-line comments
        content = self._remove_multi_line_comments(content)
        # Normalize line endings
        content = content.replace("\r\n", "\n").replace("\r", "\n")

        return content

    def _remove_single_line_comments(self, content: str) -> str:
        """Remove // style comments."""
        lines = []
        in_string = False
        for line in content.split("\n"):
            result = ""
            i = 0
            while i < len(line):
                char = line[i]
                if char == '"' and (i == 0 or line[i-1] != '\\'):
                    in_string = not in_string
                    result += char
                elif not in_string and i + 1 < len(line) and line[i:i+2] == "//":
                    break
                else:
                    result += char
                i += 1
            lines.append(result)
        return "\n".join(lines)

    def _remove_multi_line_comments(self, content: str) -> str:
        """Remove /* */ style comments."""
        result = []
        i = 0
        in_comment = False
        while i < len(content):
            if content[i] == "/" and i + 1 < len(content):
                if content[i+1] == "*" and not in_comment:
                    in_comment = True
                    i += 2
                    continue
                elif content[i+1] == "*" and in_comment:
                    if i + 2 < len(content) and content[i+2] == "/":
                        in_comment = False
                        i += 3
                        continue
            if not in_comment:
                result.append(content[i])
            i += 1
        return "".join(result)

    def get_lines_around(self, file_path: str, line_number: int, context: int = 3) -> str:
        """Get lines around a specific line number for context."""
        if file_path not in self._cache:
            content = self.parse(file_path)
            if content is None:
                return ""
        else:
            content = self._cache[file_path]

        lines = content.split("\n")
        start = max(0, line_number - context - 1)
        end = min(len(lines), line_number + context)
        return "\n".join(lines[start:end])