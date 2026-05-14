import discord
import os

intents = discord.Intents.default()
intents.message_content = True
client = discord.Client(intents=intents)

@client.event
async def on_ready():
    print(f'We have logged in as {client.user}')

# سحب التوكن من إعدادات GitHub Secret
token = os.getenv('DISCORD_TOKEN')
client.run(token)
