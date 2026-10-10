export function SectionTitle({eyebrow,title,description}:{eyebrow:string;title:string;description?:string}){
 return <div className="ft-heading"><p className="ft-eyebrow">{eyebrow}</p><h1>{title}</h1>{description&&<p className="ft-muted">{description}</p>}</div>;
}
