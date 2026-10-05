import pathlib, runpy
ns=runpy.run_path(str(pathlib.Path(__file__).resolve().parents[1]/'windows-overlay'/'overlay.py'))
# Functions share their module namespace; exercise the real Tk controls without audio.
g=ns['toggle'].__globals__;events=[];g['emit']=events.append
try:
    g['panel']('transcript');g['panel']('response');g['root'].update()
    assert len(g['panels'])==2
    for win,text,button,status in g['panels'].values():
        assert float(win.attributes('-alpha'))==1.0
        assert str(win.attributes('-transparentcolor'))=='#071426'
        assert text['background']=='#071426'
        assert button['background']!='#071426'
    for win,text,button,transparency in g['panels'].values():
        transparency.invoke()
        assert str(win.attributes('-transparentcolor'))==''
        assert transparency['text']=='TRANSPARENT: OFF'
        transparency.invoke()
        assert str(win.attributes('-transparentcolor'))=='#071426'
        assert transparency['text']=='TRANSPARENT: ON'
    g['refresh_controls']('Ready. Click START LISTENING. Saved preferences loaded.')
    assert not any(w.winfo_class()=='Label' for p in g['panels'].values() for w in p[2].master.winfo_children())
    assert len([w for w in g['root'].winfo_children() if w.winfo_class()=='Toplevel'])==2
    g['panels']['transcript'][2].invoke()
    g['panels']['response'][2].invoke()
    assert events==[{'command':'start'}], events
    assert all(str(p[2]['state'])=='disabled' for p in g['panels'].values())
    g['messages'].put({'active':True,'transcript':'Words','response':'Answer','status':'Listening'})
    g['poll']()
    assert all(p[2]['text']=='ON · STOP LISTENING' for p in g['panels'].values())
    g['panels']['response'][2].invoke()
    assert events[-1]=={'command':'stop'}
    g['messages'].put({'active':False,'transcript':'Words','response':'Answer','status':'Stopped'})
    g['poll']()
    assert all(p[2]['text']=='START LISTENING' for p in g['panels'].values())
    g['close_panel']('transcript')
    assert events[-1]=={'closed':'transcript'} and 'response' in g['panels']
    assert g['panels']['response'][1].get('1.0','end-1c')=='Answer'
    g['close_panel']('response')
    assert events[-1]=={'closed':'response'} and not g['panels']
    print('PASS: two windows only, synchronized ON/OFF, duplicate click prevention, X closes panel without stopping listener or clearing text.')
finally:g['root'].destroy()
