"""Local display only. Receives text over stdin; never captures audio or calls AI."""
import json, queue, sys, threading, time
import tkinter as tk
messages = queue.Queue()
def emit(value):
    try:
        print(json.dumps(value), flush=True)
    except (BrokenPipeError, OSError):
        pass
def reader():
    try:
        for line in sys.stdin:
            try: messages.put(json.loads(line))
            except (ValueError, TypeError): pass
    finally: messages.put({"exit": True})
root = tk.Tk(); root.withdraw()
panels = {}; last_update = time.monotonic(); active = False; pending_target = None; pending_since = 0

def drag(widget, window):
    start = [0, 0]
    widget.bind('<ButtonPress-1>', lambda e: start.__setitem__(slice(None), [e.x_root-window.winfo_x(), e.y_root-window.winfo_y()]))
    widget.bind('<B1-Motion>', lambda e: window.geometry('+%d+%d' % (max(0,e.x_root-start[0]), max(0,e.y_root-start[1]))))

def panel(kind, x=120, y=160):
    if kind in panels:
        panels[kind][0].deiconify(); return
    win=tk.Toplevel(root);win.title('MB '+('Live Transcript' if kind=='transcript' else 'AI Response'))
    win.geometry('480x300+%d+%d'%(max(0,min(x,root.winfo_screenwidth()-480)),max(0,min(y,root.winfo_screenheight()-300))))
    win.minsize(300,180);win.attributes('-topmost',True);win.attributes('-alpha',1.0);win.configure(bg='#071426')
    # Windows color key removes only the background, keeping text and controls visible.
    win.attributes('-transparentcolor','#071426')
    bar=tk.Frame(win,bg='#071426');bar.pack(fill='x')
    button=tk.Button(bar,text='START LISTENING',command=toggle,bg='#16834b',fg='white',activebackground='#116638',activeforeground='white',relief='flat',font=('Segoe UI',8,'bold'),padx=8,pady=4)
    button.pack(side='left',padx=(8,4),pady=5)
    def toggle_transparency():
        transparent=bool(str(win.attributes('-transparentcolor')))
        win.attributes('-transparentcolor','' if transparent else '#071426')
        transparency.config(text='TRANSPARENT: OFF' if transparent else 'TRANSPARENT: ON')
    transparency=tk.Button(bar,text='TRANSPARENT: ON',command=toggle_transparency,bg='#23415e',fg='white',activebackground='#315576',activeforeground='white',relief='flat',font=('Segoe UI',8,'bold'),padx=8,pady=4)
    transparency.pack(side='left',padx=4,pady=5)
    drag(bar,win)
    text=tk.Text(win,wrap='word',bg='#071426',fg='#ffffff',insertbackground='white',font=('Segoe UI',13),relief='flat',borderwidth=0,highlightthickness=0,padx=14,pady=12,state='disabled')
    text.pack(fill='both',expand=True)
    win.protocol('WM_DELETE_WINDOW',lambda:close_panel(kind));panels[kind]=(win,text,button,transparency)
    refresh_controls()

def close_panel(kind):
    if kind in panels: panels.pop(kind)[0].destroy()
    emit({'closed':kind})

def refresh_controls(status=None):
    disconnected=time.monotonic()-last_update>=8
    waiting=pending_target is not None
    for win,text,button,transparency in panels.values():
        button.config(text=('DISCONNECTED' if disconnected else 'PLEASE WAIT…' if waiting else 'ON · STOP LISTENING' if active else 'START LISTENING'),bg='#16834b',state='disabled' if disconnected or waiting else 'normal')

def toggle():
    global pending_target,pending_since
    if time.monotonic()-last_update<8 and pending_target is None:
        pending_target=not active;pending_since=time.monotonic()
        emit({'command':'stop' if active else 'start'});refresh_controls()

def poll():
    global last_update, active, pending_target
    try:
        while True:
            data=messages.get_nowait()
            if data.get('exit'):root.destroy();return
            last_update=time.monotonic()
            if data.get('heartbeat'):continue
            active=bool(data.get('active'))
            if active==pending_target:pending_target=None
            for kind in data.get('open',[]):
                if kind in ('transcript','response'):panel(kind,data.get('x',120),data.get('y',160))
            for kind,(win,text,button,transparency) in list(panels.items()):
                value=str(data.get(kind,''))
                if text.get('1.0','end-1c')!=value:
                    text.config(state='normal');text.delete('1.0','end');text.insert('1.0',value);text.see('end');text.config(state='disabled')
            refresh_controls(str(data.get('status','')))
    except queue.Empty:pass
    if pending_target is not None and time.monotonic()-pending_since>4:pending_target=None
    refresh_controls()
    root.after(100,poll)
if __name__ == '__main__':
    threading.Thread(target=reader,daemon=True).start();emit({'ready':True});poll();root.mainloop()
