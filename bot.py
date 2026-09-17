import discord
from discord import app_commands
from discord.ext import commands
import os

# ČIA ĮKELK SAVO TOKENĄ (Geriausia naudoti .env failą, bet jei nori vieno failo - įklijuok čia)
# PAVYZDYS: TOKEN = "Tavo_Naujas_Tokenas_Cia"
TOKEN = os.getenv("DISCORD_TOKEN", "ĮKELK_SAVO_TOKENĄ_ČIA_JEI_NAUDOJI_.ENV")

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)
tree = bot.tree

# ==================== PAGALBINĖS FUNKCIJOS ====================
def is_admin(interaction: discord.Interaction) -> bool:
    return interaction.user.guild_permissions.administrator

async def create_ticket_channel(interaction: discord.Interaction, ticket_type: str):
    if not interaction.guild: return
    
    overwrites = {
        interaction.guild.default_role: discord.PermissionOverwrite(read_messages=False),
        interaction.user: discord.PermissionOverwrite(read_messages=True, send_messages=True),
        interaction.guild.me: discord.PermissionOverwrite(read_messages=True, send_messages=True)
    }
    
    channel_name = f"ticket-{interaction.user.name}"
    # Patikriname, ar toks kanalas jau egzistuoja, kad nekurtume dublikatų
    existing_channel = discord.utils.get(interaction.guild.channels, name=channel_name, type=discord.ChannelType.text)
    if existing_channel:
        return await interaction.response.send_message(f"Jau turite atidarytą ticketą: {existing_channel.mention}", ephemeral=True)

    channel = await interaction.guild.create_text_channel(channel_name, overwrites=overwrites, topic=f"Ticket tipas: {ticket_type}")
    await interaction.response.send_message(f"✅ Sukurtas ticketas: {channel.mention}", ephemeral=True)
    
    embed = discord.Embed(title=f"🎟️ Naujas Ticket: {ticket_type}", description=f"Klausimą pateikė {interaction.user.mention}", color=discord.Color.blue())
    view = TicketControlView()
    await channel.send(embed=embed, view=view)
    
    dropdown_view = TicketDropdownView()
    await channel.send("👇 Pasirinkite veiksmą arba atsakymą iš meniu žemiau:", view=dropdown_view)

# ==================== /text KOMANDA ====================
@tree.command(name="text", description="Išsiųsti žinutę su nuotrauka, tekstu ir spalva")
@app_commands.describe(tekstas="Žinutės tekstas", spalva="Žinutės rėmelio spalva", nuotrauka="Nuotrauka (pasirinktinai)")
@app_commands.choices(spalva=[
    app_commands.Choice(name="Raudona", value="red"), app_commands.Choice(name="Žalia", value="green"),
    app_commands.Choice(name="Mėlyna", value="blue"), app_commands.Choice(name="Geltona", value="gold"),
    app_commands.Choice(name="Violetinė", value="purple"), app_commands.Choice(name="Oranžinė", value="orange")
])
async def text_cmd(interaction: discord.Interaction, tekstas: str, spalva: app_commands.Choice[str], nuotrauka: discord.Attachment = None):
    color_map = {"red": discord.Color.red(), "green": discord.Color.green(), "blue": discord.Color.blue(), 
                 "gold": discord.Color.gold(), "purple": discord.Color.purple(), "orange": discord.Color.orange()}
    
    embed = discord.Embed(description=tekstas, color=color_map.get(spalva.value, discord.Color.default()))
    if nuotrauka:
        embed.set_image(url=nuotrauka.url)
        
    await interaction.response.send_message(embed=embed)

# ==================== /ticket KOMANDA (Tik Admin) ====================
@tree.command(name="ticket", description="Sukurti ticket panelę serveryje (Tik Admin)")
async def ticket_cmd(interaction: discord.Interaction):
    if not is_admin(interaction):
        return await interaction.response.send_message("❌ Šią komandą gali naudoti tik administratoriai!", ephemeral=True)
    
    embed = discord.Embed(title="🎟️ Pagalbos Ticket Sistema", description="Pasirinkite vieną iš mygtukų žemiau, kad susisiektumėte su administracija.", color=discord.Color.blue())
    view = TicketPanelView()
    await interaction.response.send_message(embed=embed, view=view)

# ==================== TICKET VALDYMO KLASĖS ====================
class TicketPanelView(discord.ui.View):
    def __init__(self): super().__init__(timeout=None)

    @discord.ui.button(label="Atidaryti", style=discord.ButtonStyle.green, custom_id="ticket_open")
    async def open_ticket(self, interaction: discord.Interaction, button: discord.ui.Button):
        await create_ticket_channel(interaction, "Atidaryti")

    @discord.ui.button(label="Klausti", style=discord.ButtonStyle.blurple, custom_id="ticket_ask")
    async def ask_ticket(self, interaction: discord.Interaction, button: discord.ui.Button):
        await create_ticket_channel(interaction, "Klausti")

    @discord.ui.button(label="Pagalba", style=discord.ButtonStyle.grey, custom_id="ticket_help")
    async def help_ticket(self, interaction: discord.Interaction, button: discord.ui.Button):
        await create_ticket_channel(interaction, "Pagalba")

class TicketControlView(discord.ui.View):
    def __init__(self): super().__init__(timeout=None)

    @discord.ui.button(label="Claim", style=discord.ButtonStyle.green, custom_id="ticket_claim")
    async def claim_ticket(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not is_admin(interaction): return await interaction.response.send_message("❌ Tik staff gali claiminti!", ephemeral=True)
        await interaction.response.send_message(f"✅ Ticketą perėmė {interaction.user.mention}")

    @discord.ui.button(label="Uždaryti / Close", style=discord.ButtonStyle.red, custom_id="ticket_close")
    async def close_ticket(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not is_admin(interaction): 
            return await interaction.response.send_message("❌ Tik staff gali uždaryti ticketą!", ephemeral=True)
        await interaction.response.send_message("🔒 Ticketas uždaromas...")
        await interaction.channel.delete()

class TicketDropdownView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)
        select = discord.ui.Select(placeholder="Pasirinkite veiksmą / atsakymą...", options=[
            discord.SelectOption(label="Refund negalimas", value="refund_no", description="Atsakymas dėl negalimo refundo"),
            discord.SelectOption(label="Refund", value="refund", description="Refundo informacija"),
            discord.SelectOption(label="Pasisveikinimas", value="welcome", description="Pasisveikinimo žinutė"),
            discord.SelectOption(label="Prekės siuntimas", value="shipping", description="Informacija apie siuntimą"),
            discord.SelectOption(label="Swedbank sąskaita", value="swedbank", description="Swedbank rekvizitai"),
            discord.SelectOption(label="Payplay", value="payplay", description="Payplay informacija"),
            discord.SelectOption(label="Staff", value="staff", description="Kreipimasis į staff")
        ], custom_id="ticket_dropdown")
        select.callback = self.dropdown_callback
        self.add_item(select)

    async def dropdown_callback(self, interaction: discord.Interaction):
        value = interaction.data["values"][0]
        texts = {
            "refund_no": "Atsiprašome, tačiau šiuo metu refundas negalimas.", 
            "refund": "Refundo informacija: prašome pateikti užsakymo numerį.",
            "welcome": "Sveiki atvykę! Kaip galime jums padėti?", 
            "shipping": "Prekės bus išsiųstos per 24 valandas po apmokėjimo.",
            "swedbank": "Swedbank Sąskaita: LT00 0000 0000 0000 0000, Gavėjas: Uždarymas",
            "payplay": "Payplay informacija: ...",
            "staff": "Staff komanda netrukus susisieks su jumis."
        }
        embed = discord.Embed(title=f"🤖 Automatinis atsakymas", description=texts.get(value, "Informacija nerasta."), color=discord.Color.green())
        view = SendProductView()
        await interaction.response.send_message(embed=embed, view=view)

class SendProductView(discord.ui.View):
    def __init__(self): super().__init__(timeout=None)

    @discord.ui.button(label="📦 Dar siųsti prekę / info", style=discord.ButtonStyle.primary, custom_id="send_product_btn")
    async def send_product(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not is_admin(interaction): return await interaction.response.send_message("❌ Tik staff gali siųsti prekes!", ephemeral=True)
        await interaction.response.send_modal(ProductModal())

class ProductModal(discord.ui.Modal, title="Siųsti prekę / informaciją"):
    product_info = discord.ui.TextInput(label="Pagrindinė informacija / tekstas", style=discord.TextStyle.paragraph, placeholder="Įrašykite informaciją, kurią norite nusiųsti klientui...")
    
    async def on_submit(self, interaction: discord.Interaction):
        embed = discord.Embed(title="📦 Nauja prekė / informacija", description=self.product_info.value, color=discord.Color.gold())
        await interaction.response.send_message(embed=embed)
        await interaction.followup.send("✅ Informacija sėkmingai išsiųsta tickete!", ephemeral=True)

# ==================== BOT'O PALEIDIMAS ====================
@bot.event
async def on_ready():
    print(f"✅ Botas sėkmingai prisijungė kaip: {bot.user}")
    try:
        synced = await tree.sync()
        print(f"🔄 Sinchronizuota {len(synced)} komandų.")
    except Exception as e:
        print(f"Klaida sinchronizuojant komandas: {e}")

# Jei tokenas nebuvo įvestas, paprašome jo (tik pirmam paleidimui)
if TOKEN == "ĮKELK_SAVO_TOKENĄ_ČIA_JEI_NAUDOJI_.ENV":
    print("⚠️ Tokenas nerastas .env faile.")
    print("Prašau įklijuoti savo Discord Bot Token čia ir paspausti Enter:")
    TOKEN = input("> ")

bot.run(TOKEN)