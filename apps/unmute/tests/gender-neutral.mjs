// The learner is addressed in both forms; first- and third-person examples stay as they are.
import assert from 'node:assert/strict';
import { neutralizeRu, neutralizeCourse } from '../lib/gender-neutral.mjs';

assert.equal(neutralizeRu('Ты вчера работал?'),'Ты вчера работал(а)?');
assert.equal(neutralizeRu('Кстати, что ты вчера делал?'),'Кстати, что ты вчера делал(а)?');
assert.equal(neutralizeRu('Куда ты пошёл после этого?'),'Куда ты пошёл (пошла) после этого?');
assert.equal(neutralizeRu('Ты, наверное, устал.'),'Ты, наверное, устал(а).');
assert.equal(neutralizeRu('Если бы ты сказал раньше, я бы пришёл.'),'Если бы ты сказал(а) раньше, я бы пришёл.');
// Untouched: the speaker, a third person, already fixed text.
assert.equal(neutralizeRu('Я видел его.'),'Я видел его.');
assert.equal(neutralizeRu('Кто тебе звонил?'),'Кто тебе звонил?');
assert.equal(neutralizeRu('Ты вчера работал(а)?'),'Ты вчера работал(а)?');
assert.equal(neutralizeRu('Куда ты пошёл (пошла)?'),'Куда ты пошёл (пошла)?');

const {set,changes}=neutralizeCourse({id:'x',activities:[{id:'a',prompt:{ru:'Ты закончил?',en:'Did you finish?'}}],roadmaps:[]});
assert.equal(set.activities[0].prompt.ru,'Ты закончил(а)?');
assert.equal(set.activities[0].prompt.en,'Did you finish?');
assert.equal(changes.length,1);
assert.equal(neutralizeCourse(set).changes.length,0);
console.log('gender-neutral ok');
