export function plainText(html: string) {
  if(typeof html!=='string')return '';
  // Feeds sometimes encode markup twice. Decode as text before stripping tags;
  // rendered descriptions still use React text, never HTML injection.
  const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',bull:'•',hellip:'…'};
  let value=html;
  for(let pass=0;pass<3;pass++)value=value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(original,entity:string)=>{
    if(entity[0]!=='#')return entities[entity.toLowerCase()]??original;
    const point=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10);
    return point>0&&point<=0x10ffff&&!(point>=0xd800&&point<=0xdfff)?String.fromCodePoint(point):' ';
  });
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
