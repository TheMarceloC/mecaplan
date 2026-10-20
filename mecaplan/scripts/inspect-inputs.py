import json,re,openpyxl,pathlib
root=pathlib.Path(__file__).resolve().parents[1]
paths=[pathlib.Path(r'C:/Users/cmarc/OneDrive/Desktop/User y passwords.xlsx'),pathlib.Path(r'C:/Users/cmarc/Downloads/Matriz_Gestion_Proyecto_Digit360.xlsx')]
result=[]
for i,path in enumerate(paths):
 wb=openpyxl.load_workbook(path,data_only=False)
 book={'file':path.name,'sheets':[]}
 for ws in wb.worksheets:
  rows=[]
  for row in ws.iter_rows():
   values=[v.isoformat() if hasattr(v,'isoformat') else v for v in [c.value for c in row]]
   while values and values[-1] is None:values.pop()
   if any(v is not None for v in values):rows.append({'row':row[0].row,'values':values})
  secret_cols={j for r in rows[:10] for j,v in enumerate(r['values']) if isinstance(v,str) and re.search(r'password|contrase|clave',v,re.I)}
  book['sheets'].append({'name':ws.title,'rows':rows})
  safe=[]
  for r in rows[:18 if i==0 else 12]:
   safe.append({'row':r['row'],'values':['[OCULTO]' if j in secret_cols and r['row']>min((rr['row'] for rr in rows if j<len(rr['values']) and isinstance(rr['values'][j],str) and re.search(r'password|contrase|clave',rr['values'][j],re.I)),default=0) else v for j,v in enumerate(r['values'])]})
  print(json.dumps({'file':path.name,'sheet':ws.title,'nonemptyRows':len(rows),'preview':safe},ensure_ascii=False))
 result.append(book)
(root/'data').mkdir(exist_ok=True)
(root/'data'/'import-source.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf8')
