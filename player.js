const {Client, Util} = require('discord.js');
const { TOKEN, PREFIX, GOOGLE_API_KEY } = require('./config');
const YouTube = require('simple-youtube-api');
const ytdl = require('ytdl-core');

const client = new Client({ disableEveryone: true });

const youtube = new YouTube(GOOGLE_API_KEY);

const queue = new Map()

client.on('warn', console.warn);

client.on('error', console.error);

client.on('ready', () => console.log('Ready!'));

client.on('disconnect', () => console.log('I just disconnected, making sure you know, I will reconnect now...'));

client.on('reconnecting', () => console.log('I am reconnecting now!'));

client.on('message', async msg => { // eslint-disable-line
	if (msg.author.bot) return undefined;
	if (!msg.content.startsWith(PREFIX)) return undefined;

	const args = msg.content.split(' ');
	const searchString = args.slice(1).join(' ');
	const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
	const serverQueue = queue.get(msg.guild.id);

	let command = msg.content.toLowerCase().split(" ")[0];
	command = command.slice(PREFIX.length)
  
  if (command === `mhelp`) {
    let tosend = ['```xl', '!' + 'play Titolo Canzone : "Ti mostra i primi 10 risultati di youtube"','', 'i seguenti comandi funzionano solo quando una canzone è in riproduzione:'.toUpperCase(),'', '!' + 'pause : "Ferma la musica"',	'!' + 'riprendi : "Riprende la musica da dove si era fermata" ', '!' + 'skip : "salta la canzone in riproduzione"', '!' +	'volume (Numero da 1 a 10) : "Aumenta o diminuisci il volume"', '!' +	'stop : "Elimina la canzone in riproduzione e cancella la coda!"', '!' +	'np : "Mostra la canzone in riproduzione"', '!' +	'coda : "Mostra tutte le canzoni in coda"',	'```'];
		msg.channel.sendMessage(tosend.join('\n'));
  }

	if (command === `play`) {
		const voiceChannel = msg.member.voiceChannel;
		if (!voiceChannel) return msg.channel.send('Mi dispiace ma devi essere in un canale Vocale per riprodurre musica!');
		const permissions = voiceChannel.permissionsFor(msg.client.user);
		if (!permissions.has('CONNECT')) {
			return msg.channel.send('Non riesco a connettermi al tuo canale!');
		}
		if (!permissions.has('SPEAK')) {
			return msg.channel.send('Non posso parlare in quel canale!');
		}

		if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
			const playlist = await youtube.getPlaylist(url);
			const videos = await playlist.getVideos();
			for (const video of Object.values(videos)) {
				const video2 = await youtube.getVideoByID(video.id); // eslint-disable-line no-await-in-loop
				await handleVideo(video2, msg, voiceChannel, true); // eslint-disable-line no-await-in-loop
			}
			return msg.channel.send(`✅ Playlist: **${playlist.title}** è stata aggiunta alla coda!`);
		} else {
			try {
				var video = await youtube.getVideo(url);
			} catch (error) {
				try {
					var videos = await youtube.searchVideos(searchString, 10);
					let index = 0;
					msg.channel.send(`
__**Selezione della Canzone:**__
${videos.map(video2 => `**${++index} -** ${video2.title}`).join('\n')}
Fornisci un valore per selezionare uno dei risultati di ricerca compresi tra 1 e 10.
					`);
					// eslint-disable-next-line max-depth
					try {
						var response = await msg.channel.awaitMessages(msg2 => msg2.content > 0 && msg2.content < 11, {
							maxMatches: 1,
							time: 10000,
							errors: ['time']
						});
					} catch (err) {
						console.error(err);
						return msg.channel.send('Nessun valore inserito, cancello la selezione');
					}
					const videoIndex = parseInt(response.first().content);
					var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
				} catch (err) {
					console.error(err);
					return msg.channel.send('🆘 Non ho potuto ottenere i risultati di ricerca.');
				}
			}
			return handleVideo(video, msg, voiceChannel);
		}
	} else if (command === `skip`) {
		if (!msg.member.voiceChannel) return msg.channel.send('Non sei in un canale Vocale!');
		if (!serverQueue) return msg.channel.send("Non c'è nulla in riproduzione!");
		serverQueue.connection.dispatcher.end('Canzone saltata correttamente');
		return undefined;
	} else if (command === `stop`) {
		if (!msg.member.voiceChannel) return msg.channel.send('Non sei in un canale Vocale!');
		if (!serverQueue) return msg.channel.send("Non c'è nulla in riproduzione!");
		serverQueue.songs = [];
		serverQueue.connection.dispatcher.end('Canzone fermata correttamente!');
		return undefined;
	} else if (command === `volume`) {
		if (!msg.member.voiceChannel) return msg.channel.send('Non sei in un canale Vocale!');
		if (!serverQueue) return msg.channel.send("Non c'è nulla in riproduzione");
		if (!args[1]) return msg.channel.send(`Volume corrente a: **${serverQueue.volume}**`);
		serverQueue.volume = args[1];
		serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
		return msg.channel.send(`Ho messo il volume a: **${args[1]}**`);
	} else if (command === `np`) {
		if (!serverQueue) return msg.channel.send("Non c'è nulla in riproduzione");
		return msg.channel.send(`🎶 Sto Riproducendo: **${serverQueue.songs[0].title}**`);
	} else if (command === `coda`) {
		if (!serverQueue) return msg.channel.send("Non c'è nulla in riproduzione");
		return msg.channel.send(`
__**Canzoni in Coda:**__
${serverQueue.songs.map(song => `**-** ${song.title}`).join('\n')}
**Riproducendo:** ${serverQueue.songs[0].title}
		`);
	} else if (command === `pause`) {
		if (serverQueue && serverQueue.playing) {
			serverQueue.playing = false;
			serverQueue.connection.dispatcher.pause();
			return msg.channel.send(':pause_button: Ho fermato la musica!');
		}
		return msg.channel.send("Non c'è nulla in riproduzione");
	} else if (command === `riprendi`) {
		if (serverQueue && !serverQueue.playing) {
			serverQueue.playing = true;
			serverQueue.connection.dispatcher.resume();
			return msg.channel.send('▶ Musica ripresa correttamente!');
		}
		return msg.channel.send("Non c'è nulla in riproduzione");
	}

	return undefined;
});

async function handleVideo(video, msg, voiceChannel, playlist = false) {
	const serverQueue = queue.get(msg.guild.id);
	console.log(video);
	const song = {
		id: video.id,
		title: Util.escapeMarkdown(video.title),
		url: `https://www.youtube.com/watch?v=${video.id}`
	};
	if (!serverQueue) {
		const queueConstruct = {
			textChannel: msg.channel,
			voiceChannel: voiceChannel,
			connection: null,
			songs: [],
			volume: 5,
			playing: true
		};
		queue.set(msg.guild.id, queueConstruct);

		queueConstruct.songs.push(song);

		try {
			var connection = await voiceChannel.join();
			queueConstruct.connection = connection;
			play(msg.guild, queueConstruct.songs[0]);
		} catch (error) {
			console.error(`Non posso entrare nel canale Vocale: ${error}`);
			queue.delete(msg.guild.id);
			return msg.channel.send(`Non posso entrare nel canale Vocale: ${error}`);
		}
	} else {
		serverQueue.songs.push(song);
		console.log(serverQueue.songs);
		if (playlist) return undefined;
		else return msg.channel.send(`✅ **${song.title}** è stata aggiunta alla coda!`);
	}
	return undefined;
}

function play(guild, song) {
	const serverQueue = queue.get(guild.id);

	if (!song) {
		serverQueue.voiceChannel.leave();
		queue.delete(guild.id);
		return;
	}
	console.log(serverQueue.songs);

	const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
		.on('end', reason => {
			if (reason === 'Lo streaming non sta caricando abbastanza rapidamente.') console.log('Canzone finita.');
			else console.log(reason);
			serverQueue.songs.shift();
			play(guild, serverQueue.songs[0]);
		})
		.on('error', error => console.error(error));
	dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

	serverQueue.textChannel.send(`🎶 Inizio riproduzione: **${song.title}**`);
}
