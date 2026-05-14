import discord
from discord.ext import commands
import os
from flask import Flask
from threading import Thread

# --- كود السيرفر الوهمي للبقاء أونلاين ---
app = Flask('')

@app.route('/')
def home():
    return "Pro Robot Online!"

def run():
    app.run(host='0.0.0.0', port=8080)

def keep_alive():
    t = Thread(target=run)
    t.start()
# ---------------------------------------

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix='!', intents=intents)

@bot.event
async def on_ready():
    print(f'Logged in as {bot.user.name}')

@bot.command()
async def ping(ctx):
    await ctx.send('Pong!')

# تشغيل السيرفر قبل البوت
keep_alive()

# استخدام المتغيرات البيئية لحماية التوكن
token = os.environ.get('DISCORD_TOKEN)
bot.run(token)
