{
  function fillSpecDefaults(spec) {
    spec.tmplSegs = spec.tmplSegs.filter(seg => {
      if ((seg.segKind === 'text') && !seg.text) {
        return false;
      }
      return true;
    });
    spec.tmplSegs.forEach(seg => {
      if (seg.segKind === 'placeholder') {
        if (seg.info.pkind === undefined) {
          seg.info.pkind = 's';
        }
      }
      return seg;
    });
    if (spec.ret) {
      if (spec.ret.pkind === undefined) {
        spec.ret.pkind = 'y';
      }
      if (spec.ret.idx === undefined) {
        spec.ret.idx = 0;
      }
    }
    return spec;
  }
}

FunctionInterfaceSpec
  = tmplSegs:TemplateSegment* Arrow _ ret:(Placeholder / Void) _ { return fillSpecDefaults({tmplSegs: tmplSegs, ret: ret, rawText: text()}); }

TemplateSegment
  = placeholder:Placeholder { return {segKind: 'placeholder', info: placeholder}; }
  / textSeg: TextSegment
  / Break { return {segKind: 'break'}; }

Placeholder
  = "{" pkind:[fy]? idx:$([0-9]+)? nameEtc:PlaceholderNameType? "}" {
    var result = {pkind: pkind || undefined, idx: idx ? parseInt(idx) : undefined};
    Object.assign(result, nameEtc || {name: undefined, type: undefined});
    return result;
  }

PlaceholderNameType
  = ":" name:Name type:PlaceholderType? {
    var result = {name: name};
    Object.assign(result, type || {type: undefined});
    return result;
  }

PlaceholderType
  = ":" type:Type {
    return {type: type};
  }

Name
  = name:$([^:}]*) { return name.trim() || undefined; }

Type
  = FunctionInterfaceSpec

TextSegment
  = text:$((!Arrow !Break [^{])+) { return {segKind: 'text', text: text.trim()}; }


Arrow = "=>"

Break = "|"

Void = "void" { return undefined }

_ "whitespace"
  = [ \t\n\r]*
