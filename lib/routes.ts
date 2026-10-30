import {lodges,villages,stories} from './catalog';
const titles:Record<string,string>={
 '/lodges':'별장 찾기','/saved':'저장한 별장','/styles':'공간 취향 찾기','/ownership':'공동소유의 이해','/ownership/pricing':'지분과 비용','/ownership/process':'계약과 이용 과정','/progress':'사업 진행 현황','/life':'라이프 & 체험','/stories':'마이롯지 저널','/help':'고객지원','/privacy':'개인정보 안내','/terms':'이용 안내','/consult':'상담·현장 방문','/partners':'파트너 프로그램','/partners/apply':'파트너 지원',
 '/my':'나의 홈','/my/assets':'내 별장·계약','/my/book':'예약하기','/my/bookings':'이용 일정','/my/services':'컨시어지','/my/swaps':'이용권 교환','/my/community':'커뮤니티·행사','/my/transfers':'양도·상속','/my/support':'문의·알림',
 '/partner':'파트너 홈','/partner/leads':'추천 고객','/partner/missions':'콘텐츠·미션','/partner/rewards':'보상 지분','/partner/settlements':'정산 내역','/partner/tools':'추천 도구',
 '/admin':'운영 현황','/admin/customers':'고객·상담','/admin/contracts':'계약·권리','/admin/payments':'납입·환불','/admin/inventory':'지분 재고','/admin/bookings':'예약·이용권','/admin/operations':'현장·서비스','/admin/partners':'파트너·미션','/admin/settlements':'정산·지급','/admin/content':'콘텐츠 관리','/admin/policies':'운영 정책','/admin/support':'고객지원 관리','/admin/audit':'변경 이력','/account':'내 계정','/sign-in':'내 공간 로그인'
};
export function routeTitle(path:string):string|null{
 if(titles[path])return titles[path];
 const [,type,id,...rest]=path.split('/');if(rest.length)return null;
 if(type==='lodges')return lodges.find(l=>l.id===id)?.name||null;
 if(type==='villages')return villages.find(v=>v.id===id)?.name||null;
 if(type==='destinations')return villages.find(v=>v.id===id)?.region||null;
 if(type==='stories')return stories.find(s=>s.id===id)?.title||null;
 return null;
}
