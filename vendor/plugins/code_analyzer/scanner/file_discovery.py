"""File discovery for C/C++ source files."""

import os
from pathlib import Path
from typing import List, Optional
import fnmatch


class FileDiscovery:
    """Discover C/C++ source files recursively."""

    C_EXTENSIONS = {".c", ".cpp", ".cxx", ".cc", ".h", ".hpp", ".hxx"}
    EXCLUDE_DIRS = {
        ".git", ".svn", ".hg",
        "node_modules", "venv", ".venv",
        "build", "dist", "out",
        ".idea", ".vscode"
    }

    def __init__(self):
        self.discovered_files: List[str] = []

    def scan(self, path: str, pattern: Optional[str] = None) -> List[str]:
        """Scan directory for C/C++ files.

        Args:
            path: Root path to scan
            pattern: Optional glob pattern for filtering

        Returns:
            List of absolute file paths
        """
        self.discovered_files = []
        root_path = Path(path)

        if root_path.is_file():
            if self._is_source_file(root_path):
                return [str(root_path.absolute())]
            return []

        if root_path.is_dir():
            self._scan_directory(root_path, pattern)
        else:
            # Handle glob pattern like /path/to/**/*.c
            self._scan_glob(path)

        return self.discovered_files

    def _scan_directory(self, directory: Path, pattern: Optional[str] = None):
        """Recursively scan directory."""
        try:
            for entry in os.scandir(directory):
                if entry.is_dir():
                    if entry.name not in self.EXCLUDE_DIRS:
                        self._scan_directory(Path(entry.path), pattern)
                elif entry.is_file():
                    if self._is_source_file(entry.path):
                        if pattern is None or fnmatch.fnmatch(entry.name, pattern):
                            self.discovered_files.append(entry.path)
        except PermissionError:
            pass

    def _scan_glob(self, pattern: str):
        """Handle glob patterns."""
        root = Path(pattern)
        parent = root.parent
        for match in parent.glob(root.name):
            if match.is_file() and self._is_source_file(match):
                self.discovered_files.append(str(match.absolute()))

    def _is_source_file(self, file_path: str) -> bool:
        """Check if file is a C/C++ source file."""
        return Path(file_path).suffix.lower() in self.C_EXTENSIONS