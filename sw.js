/* Service worker da Caderneta de Campo.
   O trabalho dele é um só: fazer o app abrir sem internet. Ele guarda os arquivos
   da aplicação no aparelho e serve essa cópia quando a rede não responde.

   Os DADOS do caderno não passam por aqui — moram no IndexedDB, que é do app.
   Este arquivo cuida só do "programa", não do que você escreveu nele. */

const VERSAO = "caderneta-v1";
const ARQUIVOS = [
  ".",
  "index.html",
  "manifest.webmanifest",
  "icone-192.png",
  "icone-512.png"
];

self.addEventListener("install", ev=>{
  ev.waitUntil(
    caches.open(VERSAO)
      /* addAll falha inteiro se um arquivo faltar; um a um, o app ainda abre
         mesmo que um ícone não tenha subido. */
      .then(c=>Promise.all(ARQUIVOS.map(a=>c.add(a).catch(()=>{}))))
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
