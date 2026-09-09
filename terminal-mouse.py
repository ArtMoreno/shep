"""Send a single SGR mouse click to a selected Windows VT console."""
import ctypes as c
import sys
from ctypes import wintypes as w

pid, column, row = map(int, sys.argv[1:])
if pid <= 0 or not 1 <= column <= 1000 or not 1 <= row <= 1000:
    raise ValueError('Invalid terminal coordinate')
k = c.WinDLL('kernel32', use_last_error=True)
k.CreateFileW.argtypes = [w.LPCWSTR, w.DWORD, w.DWORD, c.c_void_p, w.DWORD, w.DWORD, w.HANDLE]
k.CreateFileW.restype = w.HANDLE
class Key(c.Structure):
    _fields_ = [('down', w.BOOL), ('repeat', w.WORD), ('vk', w.WORD), ('scan', w.WORD), ('char', w.WCHAR), ('control', w.DWORD)]
class Event(c.Structure):
    _fields_ = [('kind', w.WORD), ('key', Key)]
k.FreeConsole()
if not k.AttachConsole(pid):
    raise c.WinError(c.get_last_error())
h = None
try:
    h = k.CreateFileW('CONIN$', 0xC0000000, 3, None, 3, 0, None)
    if h == w.HANDLE(-1).value:
        raise c.WinError(c.get_last_error())
    mode = w.DWORD()
    if not k.GetConsoleMode(w.HANDLE(h), c.byref(mode)) or not mode.value & 0x200:
        raise RuntimeError('This application is not using VT input; use the key controls')
    text = f'\x1b[<0;{column};{row}M\x1b[<0;{column};{row}m'
    events = (Event * len(text))(*(Event(1, Key(1, 1, 0, 0, char, 0)) for char in text))
    written = w.DWORD()
    if not k.WriteConsoleInputW(w.HANDLE(h), events, len(events), c.byref(written)) or written.value != len(events):
        raise RuntimeError('Terminal input incomplete; click was not retried')
finally:
    if h is not None and h != w.HANDLE(-1).value:
        k.CloseHandle(w.HANDLE(h))
    k.FreeConsole()
