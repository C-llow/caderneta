/* Service worker da Caderneta de Campo.
   O trabalho dele é um só: fazer o app abrir sem internet. Ele guarda os arquivos
   da aplicação no aparelho e serve essa cópia quando a rede não responde.

   Os DADOS do caderno não passam por aqui — moram no IndexedDB, que é do app.
   Este arquivo cuida só do "programa", não do que você escreveu nele. */

const VERSAO = "caderneta-v5";
const ARQUIVOS = [
  ".",
  "index.html",
  "manifest.webmanifest",
  "icone-192-v3.png",
  "icone-512-v3.png",
  "icone-mask-192-v4.png",
  "icone-mask-512-v4.png"
];

self.addEventListener("install", ev=>{
  ev.waitUntil(
    caches.open(VERSAO)
      /* addAll falha inteiro se um arquivo faltar; um a um, o app ainda abre
         mesmo que um ícone não tenha subido. `reload` pula o cache HTTP do
         navegador: sem isso, um ícone trocado podia voltar velho mesmo com a
         VERSAO nova. */
      .then(c=>Promise.all(ARQUIVOS.map(a=>c.add(new Request(a, {cache:"reload"})).catch(()=>{}))))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate", ev=>{
  ev.waitUntil(
    caches.keys()
      .then(ks=>Promise.all(ks.filter(k=>k!==VERSAO).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch", ev=>{
  const req = ev.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);
  /* Chamadas ao Supabase nunca vêm do cache: dado de sincronização velho é pior
     que nenhum. Sem rede, elas falham — e o app já sabe lidar com isso. */
  /* Exceção: o leitor de PDF (pdf.js) vem do cdnjs, numa versão fixa que nunca
     muda. Guardado na primeira vez, o relatório abre no celular sem sinal. */
  if(url.hostname === "cdnjs.cloudflare.com" && url.pathname.indexOf("/ajax/libs/pdf.js/") === 0){
    ev.respondWith(
      caches.open(VERSAO).then(c=>c.match(req).then(guardado=>guardado || fetch(req).then(r=>{
        if(r && r.ok) c.put(req, r.clone()).catch(()=>{});
        return r;
      })))
    );
    return;
  }
  if(url.origin !== self.location.origin) return;

  /* Navegação (abrir o app): tenta a rede para pegar uma versão nova, e cai na
     cópia guardada assim que a rede demora ou não existe. É o que faz o ícone
     abrir no meio da lavoura. */
  if(req.mode === "navigate"){
    ev.respondWith(
      /* `no-cache` obriga a perguntar ao servidor se mudou. Sem isso o cache HTTP
         do navegador pode devolver a versão velha sem nem consultar o GitHub, e
         uma atualização recém-publicada demoraria a aparecer. */
      fetch(req, {cache:"no-cache"})
        .then(r=>{
          const copia = r.clone();
          caches.open(VERSAO).then(c=>c.put("index.html", copia)).catch(()=>{});
          return r;
        })
        .catch(()=>caches.match("index.html").then(r=>r || caches.match(".")))
    );
    return;
  }

  /* O manifesto também vai à rede primeiro. É por ele que o Chrome descobre que
     o ícone ou o nome do app mudaram; servido da cópia guardada, o aparelho
     nunca ficava sabendo — foi o que segurou o ícone novo em 29/09. */
  if(url.pathname.endsWith("/manifest.webmanifest")){
    ev.respondWith(
      fetch(req, {cache:"no-cache"})
        .then(r=>{
          if(r && r.ok){ const copia = r.clone(); caches.open(VERSAO).then(c=>c.put(req, copia)).catch(()=>{}); }
          return r;
        })
        .catch(()=>caches.match(req))
    );
    return;
  }

  // demais arquivos: a cópia guardada primeiro, porque não mudam sozinhos
  ev.respondWith(
    caches.match(req).then(cache=>{
      if(cache) return cache;
      return fetch(req).then(r=>{
        if(r && r.ok){
          const copia = r.clone();
          caches.open(VERSAO).then(c=>c.put(req, copia)).catch(()=>{});
        }
        return r;
      });
    })
  );
});
