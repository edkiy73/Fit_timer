import type {Preview} from '@storybook/react-vite';
import {MemoryRouter} from 'react-router';
import {I18nProvider} from '@appbase/ui-react/i18n.js';
import {dictionaries,i18nConfig} from '../src/i18n';
import {ToastProvider} from '../src/fe/toast';
import '../src/styles.css';
import '../src/fe/kit/base.css';
import '../src/fe/kit/tokens.css';
import '../src/fe/kit/kit.css';
import '../src/fe/kit/loading.css';
import '../src/fe/shell.css';

// Every story renders inside the app's own frame: V21 scope, the `.root` that sheets and dialogs portal into,
// translations, a router and the toast host — so a component looks and behaves exactly as on a screen.
const preview:Preview={
  parameters:{
    layout:'fullscreen',
    controls:{expanded:true,sort:'requiredFirst'},
    a11y:{test:'error'},
    backgrounds:{disable:true},
    options:{storySort:{order:['Основа',['Введение','Цвета','Типографика','Отступы','Скругления и тени','Высоты и иконки'],'Кнопки','Навигация','Списки','Выбор','Поля','Окна','Сообщения','Прочее']}},
  },
  globalTypes:{theme:{description:'Тема',toolbar:{title:'Тема',icon:'mirror',items:[{value:'light',title:'Светлая'},{value:'dark',title:'Тёмная'}],dynamicTitle:true}}},
  initialGlobals:{theme:'light'},
  decorators:[(Story,ctx)=>{document.documentElement.setAttribute('data-theme',ctx.globals.theme as string);return <I18nProvider dictionaries={dictionaries} config={i18nConfig} storageKey="feture.sb.locale">
    <MemoryRouter>
     <div className="v21 fe-v21" style={{position:'relative',inset:'auto',height:'auto',overflow:'visible',minHeight:ctx.viewMode==='docs'?0:'100vh'}}>
      <div className="root" style={{position:'relative',height:'auto',overflow:'visible',minHeight:ctx.viewMode==='docs'?0:'100vh'}}>
       <ToastProvider nodock><div style={{padding:24,maxWidth:440}}><Story/></div></ToastProvider>
      </div>
     </div>
    </MemoryRouter>
   </I18nProvider>;}],
};
export default preview;
