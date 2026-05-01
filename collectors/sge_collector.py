def fazer_login(self) -> bool:
        try:
            login_url = f"{self.base_url}/SCA/Forms/Login.aspx"
            log.info(f"Acessando: {login_url}")
            self.page.goto(login_url, wait_until="domcontentloaded", timeout=45000)
            time.sleep(3)
            log.info(f"URL atual: {self.page.url}")

            # Diagnóstico: mostra todos os inputs da página
            inputs_info = self.page.evaluate("""
                () => Array.from(document.querySelectorAll('input')).map(el => ({
                    type: el.type||'', id: el.id||'', name: el.name||'',
                    placeholder: el.placeholder||''
                }))
            """)
            log.info(f"Inputs na pagina: {inputs_info}")

            # Campo email/usuário
            email_field = None
            for sel in ['input[type="email"]', 'input[type="text"]',
                        'input[id*="Email"]', 'input[id*="Login"]',
                        'input[name*="Email"]', 'input[name*="Login"]']:
                try:
                    f = self.page.locator(sel).first
                    if f.count() > 0 and f.is_visible(timeout=2000):
                        email_field = f
                        log.info(f"Campo email: {sel}")
                        break
                except:
                    continue

            pass_field = None
            try:
                pass_field = self.page.locator('input[type="password"]').first
                if not pass_field.is_visible(timeout=2000):
                    pass_field = None
            except:
                pass_field = None

            if not email_field or not pass_field:
                log.error(f"Campos nao encontrados. HTML: {self.page.content()[:4000]}")
                return False

            # Digita simulando teclado (dispara eventos JS do ASP.NET)
            email_field.click()
            email_field.fill("")
            email_field.type(SGE_USER, delay=80)
            time.sleep(0.5)

            pass_field.click()
            pass_field.fill("")
            pass_field.type(SGE_PASSWORD, delay=80)
            time.sleep(0.5)

            log.info(f"Digitado: {SGE_USER[:5]}*** / senha preenchida")

            # Clica no botão
            clicou = False
            for sel in ['input[value="Entrar"]', 'input[type="submit"]',
                        'button[type="submit"]', 'button:has-text("Entrar")',
                        'a:has-text("Entrar")', 'button']:
                try:
                    btn = self.page.locator(sel).first
                    if btn.count() > 0 and btn.is_visible(timeout=2000):
                        btn.click()
                        log.info(f"Clicou: {sel}")
                        clicou = True
                        break
                except:
                    continue

            if not clicou:
                log.info("Nenhum botao, usando Enter...")
                pass_field.press("Enter")

            # Aguarda resposta (networkidle é mais confiável para ASP.NET)
            try:
                self.page.wait_for_load_state("networkidle", timeout=25000)
            except:
                self.page.wait_for_load_state("domcontentloaded", timeout=10000)

            time.sleep(2)
            log.info(f"URL apos login: {self.page.url}")

            if "Login.aspx" in self.page.url:
                erro = self.page.evaluate("""
                    () => Array.from(document.querySelectorAll('span,div,p'))
                        .map(e => e.innerText.trim())
                        .filter(t => t.length > 3 && t.length < 150 &&
                            /senha|usu.rio|inv.lid|erro|incorret/i.test(t))
                        .slice(0,3).join(' | ')
                """)
                log.error(f"Login falhou. Erro SGE: '{erro}'")
                return False

            log.info("Login OK!")
            return True

        except PlaywrightTimeout:
            log.error("Timeout ao fazer login")
            return False
        except Exception as e:
            log.error(f"Erro no login: {e}")
            return False
