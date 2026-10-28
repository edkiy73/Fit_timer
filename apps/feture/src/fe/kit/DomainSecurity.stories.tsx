import type {Meta,StoryObj} from '@storybook/react-vite';
import {fn} from 'storybook/test';
import {Globe,Smartphone} from 'lucide-react';
import {Btn,Card,CodeInput,Field,QrCode,RecoveryCodes,Row,SecretKey,Stack} from './index';

const URI='otpauth://totp/FetUre%3A%40mod_alisa?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=FetUre&algorithm=SHA1&digits=6&period=30';
const CODES=['k7m2p-q9xr4','a3fhn-8wt2c','zp4rk-m6s9d','h2qv7-tnx3e','c9wkd-4mfp7','r6tz2-ybk8n','m3pxe-w7q2h','d8nv4-sf6ka','u2hcy-9rm5t','t5kwa-3pzd8'];
const meta={title:'Домен/Безопасность',component:QrCode,tags:['autodocs'],
 parameters:{docs:{description:{component:'Второй фактор (2FA) сотрудников и «Мои устройства»: QR для приложения-аутентификатора (рисуется здесь, без внешних сервисов), ключ для ручного ввода, коды восстановления (показываются один раз), строки устройств — это `Row`.'}}},
 args:{value:URI,label:'QR-код для приложения-аутентификатора',size:200},
} satisfies Meta<typeof QrCode>;
export default meta;
type S=StoryObj<typeof meta>;
export const QR:S={};
export const Ключ:S={name:'Ключ для ручного ввода',render:()=><SecretKey value="JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP" label="Или введи ключ вручную" copyLabel="Скопировать" onCopy={fn()}/>};
export const Коды:S={name:'Коды восстановления',render:()=><RecoveryCodes codes={CODES} label="Коды восстановления" copyLabel="Скопировать все" onCopy={fn()}/>};
export const Подключение:S={name:'Подключение: QR, ключ, код',render:()=><Stack gap={4}><QrCode value={URI} label="QR"/><SecretKey value="JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP" label="Или введи ключ вручную" copyLabel="Скопировать" onCopy={fn()}/>
 <Field label="Код из приложения"><CodeInput value="" onChange={fn()} label="Код из приложения"/></Field><Btn>Подтвердить</Btn></Stack>};
export const Устройства:S={name:'Мои устройства (строки Row)',render:()=><Card list>
 <Row icon={Globe} tone="g" noChev title="Это устройство" sub="Chrome · Mac · Берлин, Германия · сейчас"/>
 <Row icon={Smartphone} noChev title="Android" sub="Москва, Россия · был 2 ч назад" end={<Btn kind="text" size="sm" auto>Выйти</Btn>}/>
</Card>};
