# Como rodar o projeto

O sistema possui 3 serviços. Em produção, os backends rodam no Render. Para desenvolvimento local, siga as instruções abaixo.

---

## Deploy em Produção (Render)

Os backends estão hospedados no Render e sobem automaticamente a cada push na `main`:

| Serviço | URL |
|---------|-----|
| Backend Node (API) | https://ocianclub-node.onrender.com |
| Backend ML (IA) | https://ocianclub-ml.onrender.com |

O app mobile (`cfaOcian`) já está configurado para apontar para a URL de produção.

---

## 1. Backend de IA (Python)

Responsável por processar dados e gerar perfis dos jogadores.

```bash
cd backend-ml
pip install fastapi uvicorn pandas scikit-learn
uvicorn main:app --reload
```

Roda em: http://localhost:8000

---

## 2. Backend Node (API + Banco)

Antes de iniciar, crie um arquivo `.env` em `backend-node` com:

```
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
PYTHON_AI_URL=http://localhost:8000  # ou a URL do Render em produção
GEMINI_API_KEY=...
```

```bash
cd backend-node
npm install
npx prisma generate
npx tsx src/server.ts
```

Roda em: http://localhost:3000

---

## 3. App Mobile (Expo)

```bash
cd cfaOcian
npm install
npx expo start
```

Abra no celular com Expo Go ou use emulador Android.

> Por padrão o app aponta para o backend em produção no Render.
> Para apontar para o localhost durante o desenvolvimento, altere `BASE_URL` em `cfaOcian/src/services/api.ts`.

---

# Banco de Dados (Prisma)

Não alterar diretamente no Supabase. Tudo deve ser feito via código.

---

## Após dar git pull

Atualize o Prisma:

```bash
npx prisma generate
```

---

## Criar ou alterar tabelas

1. Edite:
```
prisma/schema.prisma
```

2. Rode:
```bash
npx prisma migrate dev --name nome_da_alteracao
```

3. Commit e push das alterações

---

# Observações

- Cada serviço tem suas próprias dependências
- Sempre rodar `npm install` ou `pip install` ao entrar no projeto
- Backend Node depende do `.env` configurado corretamente
- Em produção, as variáveis de ambiente são configuradas diretamente no painel do Render (não usar `.env` em produção)
