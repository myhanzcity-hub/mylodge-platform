export const plans = [
  { id: "share-120", fraction: "1/120", units: 1, price: 3960000, nights: 3, label: "가볍게, 나의 첫 별장" },
  { id: "share-60", fraction: "1/60", units: 2, price: 7920000, nights: 6, label: "계절마다 돌아오는 휴식" },
  { id: "share-30", fraction: "1/30", units: 4, price: 15840000, nights: 12, label: "조금 더 길게 머무는 삶" },
  { id: "share-24", fraction: "1/24", units: 5, price: 19800000, nights: 15, label: "나만의 여유로운 베이스캠프" },
] as const;

export type Lodge = { id: string; name: string; region: string; villageId: string; styleId: string; image: string; interior: string; tone: string; tagline: string; amenities: string[]; capacity: number; kind: string; status: string };
export const lodges: Lodge[] = [
 {id:"jumunjin-mint",name:"민트 코스트 스위트",region:"주문진",villageId:"jumunjin",styleId:"mint",image:"/images/villa-mint.jpeg",interior:"/images/style-mint.jpeg",tone:"#dfeae1",tagline:"바다의 아침과 초록의 여유 사이",amenities:["테라스","복층","바다 가까이"],capacity:4,kind:"스위트",status:"계획 단계"},
 {id:"yangyang-rose",name:"로즈 가든 스위트",region:"양양",villageId:"yangyang",styleId:"pink",image:"/images/villa-rose.jpeg",interior:"/images/style-pink.jpeg",tone:"#f2dfdc",tagline:"아무것도 서두르지 않는 하루",amenities:["미니 가든","복층","바비큐 계획"],capacity:4,kind:"스위트",status:"계획 단계"},
 {id:"jumunjin-coral",name:"코랄 선셋 프레스티지",region:"주문진",villageId:"jumunjin",styleId:"coral",image:"/images/villa-coral.jpeg",interior:"/images/style-coral.jpeg",tone:"#f1d8ca",tagline:"해 질 무렵, 더 깊어지는 휴식",amenities:["테라스","프레스티지","넓은 거실"],capacity:6,kind:"프레스티지",status:"콘셉트"},
 {id:"yangyang-forest",name:"포레스트 우드 스위트",region:"양양",villageId:"yangyang",styleId:"sage",image:"/images/villa-wood.jpeg",interior:"/images/style-sage.jpeg",tone:"#e6e6d9",tagline:"숲의 리듬으로 살아보는 주말",amenities:["정원","자연 가까이","조용한 휴식"],capacity:4,kind:"스위트",status:"콘셉트"},
 {id:"jumunjin-blue",name:"블루 브리즈 스위트",region:"주문진",villageId:"jumunjin",styleId:"blue",image:"/images/coast.jpeg",interior:"/images/style-blue.jpeg",tone:"#dceaf0",tagline:"창밖의 푸른 풍경을 내 일상으로",amenities:["바다 가까이","테라스","복층"],capacity:4,kind:"스위트",status:"콘셉트"},
 {id:"yangyang-peach",name:"피치 데이즈 스위트",region:"양양",villageId:"yangyang",styleId:"peach",image:"/images/villa-rose.jpeg",interior:"/images/style-peach.jpeg",tone:"#f1e4d4",tagline:"함께 머무는 시간이 가장 좋은 공간",amenities:["미니 가든","가족 휴식","복층"],capacity:4,kind:"스위트",status:"콘셉트"},
];
export const styles = [
 {id:"pink",name:"소프트 핑크 & 크림",mood:"로맨틱 모던",color:"#e9c6c5",image:"/images/style-pink.jpeg",detail:"블러시 핑크, 크림 화이트와 로즈골드의 부드러운 조화."},
 {id:"mint",name:"민트 그린 & 화이트",mood:"프레시 모던",color:"#b9d8c2",image:"/images/style-mint.jpeg",detail:"밝은 주방과 민트 포인트, 상쾌하고 정돈된 공간."},
 {id:"lavender",name:"라벤더 & 그레이",mood:"엘레강스 모던",color:"#c9c1dc",image:"/images/style-lavender.jpeg",detail:"차분한 라벤더와 패브릭이 만드는 깊이 있는 휴식."},
 {id:"peach",name:"피치 & 베이지",mood:"웜 모던",color:"#e8c7aa",image:"/images/style-peach.jpeg",detail:"따뜻한 목재와 피치 컬러, 편안한 생활의 온도."},
 {id:"blue",name:"스카이 블루 & 화이트",mood:"쿨 모던",color:"#b9d8e6",image:"/images/style-blue.jpeg",detail:"바다와 이어지는 블루, 밝고 청량한 코스탈 무드."},
 {id:"coral",name:"코랄 & 아이보리",mood:"트로피컬 모던",color:"#eaa696",image:"/images/style-coral.jpeg",detail:"코랄 오렌지와 식물이 어우러진 생기 있는 휴양지."},
 {id:"sage",name:"세이지 그린 & 샌드",mood:"얼씨 모던",color:"#aebca1",image:"/images/style-sage.jpeg",detail:"자연 재료와 대지의 색으로 차분하게 채운 시간."},
 {id:"rose",name:"더스티 로즈 & 차콜",mood:"소피스티케이티드 모던",color:"#b79096",image:"/images/style-rose.jpeg",detail:"짙은 대비와 금속, 벨벳의 절제된 존재감."},
 {id:"yellow",name:"버터 옐로우 & 화이트",mood:"선샤인 모던",color:"#ecda9e",image:"/images/style-yellow.jpeg",detail:"햇빛 같은 포인트가 하루의 시작을 밝히는 공간."},
 {id:"gray",name:"소프트 그레이 & 블러쉬",mood:"뉴트럴 시크",color:"#d0caca",image:"/images/style-gray.jpeg",detail:"정돈된 가구와 중립색, 공간에 남겨 둔 여백."},
];
export const villages = [
 {id:"jumunjin",name:"주문진 코스트 빌리지",region:"강릉 · 주문진",image:"/images/hero.jpeg",description:"바다 가까이, 일상의 속도에서 한 걸음 떨어진 휴식.",tag:"1호 사업 계획",accent:"#dceaf0"},
 {id:"yangyang",name:"양양 가든 빌리지",region:"강원 · 양양",image:"/images/aerial.jpeg",description:"자연과 사람 사이, 함께 쉬는 새로운 방식.",tag:"2호 사업 계획",accent:"#e1e8db"},
];
export const services = [
 {id:"cleaning",name:"룸 클리닝",price:20000,image:"/images/style-gray.jpeg",unit:"회",description:"머물기 전후를 편안하게. 예약 일정에 맞춘 공간 정돈."},
 {id:"bedding",name:"프리미엄 침구",price:8000,image:"/images/style-peach.jpeg",unit:"세트",description:"위생 포장된 침구로 완성하는 포근한 밤."},
 {id:"dining",name:"인룸 다이닝",price:35000,image:"/images/dining.jpeg",unit:"인",description:"별장에서 천천히 즐기는 식사. 메뉴와 제공 시간 선택."},
 {id:"cart",name:"빌리지 카트",price:5000,image:"/images/cart.jpeg",unit:"코스",description:"주차장에서 별장까지, 가볍고 편안한 이동."},
];
export const stories = [
 {id:"a-place-to-return",category:"LODGE JOURNAL",title:"여행의 목적지가, 돌아올 곳이 될 때",summary:"한 번의 여행을 넘어, 나의 생활에 휴양지를 더하는 이야기.",image:"/images/coast.jpeg",minutes:4},
 {id:"your-color",category:"SPACE & TASTE",title:"당신의 휴식은 어떤 색인가요?",summary:"열 가지 색과 재료에서 발견하는 나만의 별장 취향.",image:"/images/style-mint.jpeg",minutes:3},
 {id:"shared-ownership",category:"OWNERSHIP GUIDE",title:"함께 소유한다는 것의 의미",summary:"소유 지분과 이용 박수, 관리와 예약을 하나씩 살펴봅니다.",image:"/images/villa-wood.jpeg",minutes:5},
];
export const faqs = [
 {category:"소유",q:"별장 전체를 구매하는 건가요?",a:"사업계획서는 한 채의 1/120·1/60·1/30·1/24 지분을 공동소유하는 구조를 제시합니다. 실제 소유 대상과 권리 형태는 계약 대상·권리 문서를 확인해야 합니다."},
 {category:"비용",q:"396만 원에는 무엇이 포함되나요?",a:"PDF 기준 1/120 지분 분양대금입니다. 취득·등기 관련 항목, 옵션, 이용 시 비용의 포함 여부는 최종 상품 조건에서 별도로 확인하도록 설계했습니다."},
 {category:"예약",q:"원하는 날짜에 언제든 이용할 수 있나요?",a:"연간 이용 박수 안에서 단지의 예약 개방·시즌 배정·잔여 객실 조건에 따라 이용합니다. 미리보기에서는 가상 이용권과 예약 재고로 흐름을 체험할 수 있습니다."},
 {category:"비용",q:"1박 26,400원은 실제 숙박 요금인가요?",a:"396만 원을 50년, 매년 3박으로 나눈 분양대금 환산 예시입니다. 실제 1박 예약요금이나 이용 시 청구액을 뜻하지 않습니다."},
 {category:"이용",q:"가족이나 지인이 대신 이용할 수 있나요?",a:"지정 이용자 초대를 통해 해당 예약의 방문 정보만 공유하도록 설계했습니다. 실제 허용 범위와 책임은 운영규정에 따릅니다."},
 {category:"사업",q:"주문진과 양양은 현재 예약할 수 있나요?",a:"이 사이트는 제공된 사업계획서를 바탕으로 만든 구현 미리보기입니다. 이미지·별장명·구성은 계획과 콘셉트이며, 실제 개장·분양·예약 가능 여부를 확정해 안내하는 사이트는 아닙니다."},
];
export const won=(n:number)=>new Intl.NumberFormat("ko-KR").format(n)+"원";
export const manwon=(n:number)=>new Intl.NumberFormat("ko-KR").format(n/10000)+"만 원";
