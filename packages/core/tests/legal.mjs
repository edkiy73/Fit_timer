/* Legal pages: owner and contacts from Admin replace the page's own text; empty fields keep it. */
const {applyLegalDetails} = await import('../dist/core/legal.js');

let bad = 0;
const ok = (name, cond) => { if(!cond) bad++; console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name); };

function page(){
  const node = (tagName, text, attrs = {}) => ({tagName, textContent:text, attrs, setAttribute(k, v){ this.attrs[k] = v; }});
  const nodes = {
    operator:[node('SPAN', 'владелец приложения')],
    email:[node('A', 'old@example.com', {href:'mailto:old@example.com'}), node('A', 'old@example.com', {href:'mailto:old@example.com'})],
    ageFrom:[node('SPAN', '14')]
  };
  return {nodes, querySelectorAll(selector){ return nodes[/data-legal="(\w+)"/.exec(selector)[1]] || []; }};
}

const empty = page();
applyLegalDetails(empty, {owner:'', country:'', email:'', ageFrom:0});
ok('empty fields keep the page text', empty.nodes.operator[0].textContent === 'владелец приложения'
  && empty.nodes.email[0].textContent === 'old@example.com' && empty.nodes.ageFrom[0].textContent === '14');

const filled = page();
applyLegalDetails(filled, {owner:'ИП Иванов И. И.', country:'Сербия', email:'help@unmute.app', ageFrom:16});
ok('owner and country are shown together', filled.nodes.operator[0].textContent === 'ИП Иванов И. И., Сербия');
ok('every email place gets the text and the mail link',
  filled.nodes.email.every(n => n.textContent === 'help@unmute.app' && n.attrs.href === 'mailto:help@unmute.app'));
ok('minimum age is replaced', filled.nodes.ageFrom[0].textContent === '16');

const noCountry = page();
applyLegalDetails(noCountry, {owner:'UnMute Ltd'});
ok('owner without a country stands alone', noCountry.nodes.operator[0].textContent === 'UnMute Ltd');
applyLegalDetails(noCountry, null);
ok('missing details change nothing', noCountry.nodes.operator[0].textContent === 'UnMute Ltd');

console.log(bad ? `\nLegal details failures: ${bad}` : '\nLegal details behave correctly');
process.exit(bad ? 1 : 0);
