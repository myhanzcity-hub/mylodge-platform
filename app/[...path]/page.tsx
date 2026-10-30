import SiteApp from "@/components/site-app";
import {notFound} from 'next/navigation';
import {routeTitle} from '@/lib/routes';
export async function generateMetadata({params}:{params:Promise<{path:string[]}>}){const p=await params;return {title:routeTitle('/'+p.path.join('/'))||'페이지를 찾을 수 없습니다'};}
export default async function Page({params,searchParams}:{params:Promise<{path:string[]}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const p=await params,s=await searchParams; const search:Record<string,string>={};
 if(!routeTitle('/'+p.path.join('/')))notFound();
 for(const [key,value] of Object.entries(s)) if(value!==undefined) search[key]=Array.isArray(value)?value[0]:value;
 return <SiteApp path={'/'+p.path.join('/')} search={search}/>;
}
