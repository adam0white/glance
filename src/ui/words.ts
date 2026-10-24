/** Display only: stored radio words, exports and replay fingerprints stay unchanged. */
const WORDS: Record<string, string> = {
  'Long night. You were there for it.': 'It was a long night. You were there for it.',
  'She went over. Thirty years on this dam and she went over.':
    'Water came over the dam. I have worked here for thirty years, and water came over the dam.',
  'You leaned on me once. Once is enough.': 'You insisted once. Once is enough.',
  'I said no once. You took it. Good.': 'I said no once. You accepted it. That was good.',
  'Sorry I couldn’t, earlier.': 'I’m sorry I couldn’t do it earlier.',
  'You again. Hold on.': 'You’re calling again. Hold on.',
  'Again? Go on, I’ll look.': 'You’re calling again? All right, I’ll look.',
  'If you say so.': 'I’ll do it if you say so.',
  'Aye. If that’s what you want.': 'Aye. I’ll do it if that’s what you want.',
  'Fair enough.': 'That is fair enough.',
  'I did everything you said, sir. Everything.': 'I did everything you said, sir. I did everything.',
  'Going now.': 'I’m going now.',
  'On my way.': 'I’m on my way.',
  'On it, sir.': 'I’ll do it, sir.',
  'Going, sir.': 'I’m going, sir.',
  'Yes! On it.': 'Yes! I’ll do it.',
  'OK. OK, going.': 'OK. OK, I’m going.',
  'You’re the desk.': 'You’re in charge at the desk.',
  'Your call.': 'You decide.',
  'If you think so, sir.': 'I’ll do it if you think so, sir.',
  'Not yet. I’ve nothing left in me. Twenty minutes.':
    'Not yet. I have no energy left. Give me twenty minutes.',
  'Kettle’s on. Shout if you want me.': 'The kettle is on. Call me if you need me.',
  'Line’s back. Did you hear any of that? Never mind.':
    'The radio is back. Did you hear any of that? Never mind.',
  'First week on the night desk. One dam in my valley, one keeper on it, rain on the way.':
    'This is my first week on the night desk. One keeper works at the dam above my valley. Rain is on the way.',
  'Every figure on this board is what Dai saw. Tap a gauge to ask him for it.':
    'Every reading on this board is what Dai saw. Tap a gauge to choose a job, then ask him to read it.',
  'Coming down heavier up here now.': 'The rain is heavier up here now.',
  'You’re the new one, then. Where’s Morgan gone? Twelve years on that desk.':
    'You’re the new one, then. Where’s Morgan gone? He spent twelve years on that desk.',
  'Met Office: heavy rain over the hills until first light.':
    'The Met Office expects heavy rain over the hills until first light.',
  'Bridge Inn. You’re the new one at the authority? Ring if you need eyes on the river, love.':
    'This is the Bridge Inn. You’re the new one at the authority? Ring if you need me to look at the river, love.',
  'Morgan used to ring at one for the level whether I’d said it or not. Habit.':
    'Morgan used to ring at one for the level whether I’d said it or not. It was his habit.',
  'Ground’s full. Whatever falls now comes straight down.':
    'The ground is full of water. Any more rain runs straight down.',
  'Bridge Inn again. The cellar’s weeping, which it does when she’s up. Just so you know.':
    'This is the Bridge Inn again. Water is seeping into the cellar. That happens when the river is high. I thought you should know.',
  'The agency has sent a second keeper. Callum, twenty-four, his second week. Dai has not said a word about him.':
    'The agency has sent a second keeper. Callum is twenty-four, and this is his second week. Dai has not said a word about him.',
  'Two men, one wheel. Who walks and who sleeps is up to you.':
    'Two men share one gate wheel. You decide who walks and who sleeps.',
  'Callum here, sir. Ready for anything.': 'This is Callum, sir. I’m ready for anything.',
  'Lad’s got the wheel the wrong way round in his head. I’ll not say.':
    'The lad has mixed up which way to turn the wheel. I’ll not say anything.',
  'Gales with the rain tonight. The radio mast on the ridge drops out in the gusts.':
    'There are gales and rain tonight. The radio mast on the ridge loses its signal in strong gusts.',
  'The wettest night of the week, on the wettest ground. There is a painted mark high on the dam wall: ’79.':
    'This is the wettest night of the week. The ground is already soaked. A painted mark high on the dam wall reads “’79”.',
  'Bring the dam and the town to the morning.': 'Keep the dam and the town safe until morning.',
  'She was at the mark in seventy-nine. I was sixteen. My dad had this wheel.':
    'The water reached that mark in seventy-nine. I was sixteen. My dad worked this wheel.',
  'River’s talking tonight. I’ve moved the chairs upstairs.':
    'The river is loud tonight. I’ve moved the chairs upstairs.',
  'Sir, my partner rang. She says the lane’s full of water. Our lane.':
    'Sir, my partner rang. She says our lane is full of water.',
  'I rang the warden. Mill Lane again. He said they’d heard that one before, but he would knock.':
    'I rang the warden about Mill Lane again. He said they’d heard that warning before, but he would knock on their doors.',
  'The phone at the Bridge Inn rings out. Lights off over the bar.':
    'Nobody answers the phone at the Bridge Inn. The lights over the bar are off.',
  'Down at the bottom step. Nothing to worry about.':
    'The river is at the bottom step. There is nothing to worry about.',
  'It’s at the second step. Bit brown.': 'It’s at the second step. The water is a bit brown.',
  'Third step, love. It’s moving.': 'It’s at the third step, love. The water is moving.',
  'Fourth step. That’s high. Mill Lane gets it at five.':
    'It’s at the fourth step. That’s high. Mill Lane floods at the fifth step.',
  'Lightning over the valley. For a moment the camera on the dam showed the wall.':
    'Lightning flashed over the valley. For a moment the camera on the dam showed the wall.',
  'I can’t. I’m done in. Give me twenty.': 'I can’t. I’m exhausted. Give me twenty minutes.',
  'I’m done in, sir. Give me a bit.': 'I’m exhausted, sir. Give me a little time.',
  'In a bit. Kettle’s nearly on.': 'I’ll do it in a little while. The kettle is nearly ready.',
  'Two minutes, sir. I’m frozen.': 'Give me two minutes, sir. I’m frozen.',
  'Screen’s clear. Took the skin off my hands.':
    'The debris screen is clear. I scraped the skin off my hands.',
  'Got it off, sir! It’s clear.': 'I got the tree off, sir! The debris screen is clear.',
  'There’s a tree down on the screen. She’s choking.':
    'There’s a tree on the debris screen. It is blocking the water.',
  'Sir, there’s a whole tree on the screen!': 'Sir, there’s a whole tree on the debris screen!',
  'You let her down before it came. That’s the job. Morgan did that.':
    'You lowered the dam level before the rainwater arrived. That’s the job. Morgan did that.',
  'You sent me to sleep on watch. Thirty years nobody did that.':
    'You sent me to sleep on watch. Nobody did that in thirty years.',
  'Quiet on the radio tonight. Were you even there?':
    'You were quiet on the radio tonight. Were you even there?',
  'Lot of walking tonight, sir. Fine. It’s fine.':
    'I did a lot of walking tonight, sir. It’s fine. It’s fine.',
  'You asked proper. Not many do.': 'You asked me properly. Not many people do.',
  'Old dam held. She usually does.': 'The old dam held. She usually does.',
  'Shut my eyes for a minute. It was longer than a minute.':
    'I shut my eyes for a minute. It was longer than a minute.',
  'Thirty years I never slept on watch. Now look.': 'I never slept on watch in thirty years. Now look at me.',
  'Slept in the chair. My dad would have had words.': 'I slept in the chair. My dad would have told me off.',
  'Easy. I’ll have plenty for the next round.':
    'That is easy. I’ll have plenty of energy for the next round.',
  'I’ll do it. Don’t ask me for much after.': 'I’ll do it. Don’t ask me to do much afterwards.',
  'I’ll do it, sir. I’ll be done in after.': 'I’ll do it, sir. I’ll be exhausted afterwards.',
  'Dam keeper, thirty-one years here. Separated; his adult daughter lives nearby.':
    'He has worked here as a dam keeper for thirty-one years. He is separated, and his adult daughter lives nearby.',
  'Agency keeper, second week. His partner and baby are at home.':
    'He is an agency keeper in his second week. His partner and baby are at home.',
  'Bridge Inn keeper. She and her long-term partner run the inn; her river reports are observations from the steps.':
    'She and her long-term partner run the Bridge Inn. She reports what she sees from the river steps.',
  'Visiting maintenance technician. A five-day portable-lamp repair contract, with family leave and travel arranged from the Coast. Married, with a stepchild. No gate or dam-engineering authority.':
    'He is a visiting maintenance technician from the Coast. He has arranged family leave and travel for five days of portable-lamp repairs. He is married and has a stepchild. He has no authority over the gate or dam engineering.',
  'Visiting field ecologist from the Coast, on a five-day downstream survey with access agreed. An older sibling remains at home. No control-room engineering authority.':
    'She is a visiting field ecologist from the Coast. She has permission to survey downstream for five days. Her older sibling remains at home. She has no engineering authority in the control room.',
  'That folded stand by the stairs? Mine. Let me finish with the river first; you can ask again later.':
    'That folded stand by the stairs is mine. Let me finish with the river first. You can ask again later.',
  'My handover list has a workaround for a sensor we replaced years ago. Callum needs the list, with that uncertainty written beside it. Not another rule to obey because I said so.':
    'My handover list has a workaround for a sensor we replaced years ago. Callum needs the list, with that uncertainty written beside it. It should not be another rule to obey just because I said so.',
};

export function displayWords(text: string): string {
  const delayed = /^Radio’s back\. (Level|Weir) at (\d{2}:\d{2}): (.*)$/s.exec(text);
  if (delayed)
    return `The radio is back. This reading was written at ${delayed[2]}. ${displayWords(delayed[3]!)}`;
  if (text.startsWith('(a long yawn) ')) return `(a long yawn) ${displayWords(text.slice(14))}`;
  const weir = /^(?:Weir’s |Weir board, )(.*)$/s.exec(text);
  if (weir) return `This is the weir reading. ${displayWords(weir[1]!)}`;
  let out = WORDS[text] ?? text;
  // Keep the stated value and the speaker’s confidence. Only complete the spoken sentences.
  out = out.replace(
    /\b(nought|one|two|three|four|five|six|seven|eight|nine)-(nought|one|two|three|four|five|six|seven|eight|nine)\b/g,
    '$1 point $2',
  );
  out = out.replace(
    /Evening\. Level’s (.*?), gate’s on (.*?)\. (Raining up top\.|Still raining\.)/,
    'Good evening. The level is $1, and the gate is on $2. It is $3',
  );
  out = out
    .replace('It is Raining up top.', 'It is raining up top.')
    .replace('It is Still raining.', 'It is still raining.');
  out = out.replace(/^She stuck\. Got her to (.*)\.$/, 'The gate stuck. I got it to $1.');
  out = out.replace(
    /^Sorry, sir, she won't go further\. She's on (.*)\.$/,
    'Sorry, sir, the gate will not go further. It is on $1.',
  );
  out = out.replace(/^Done, sir\. Gate's on (.*)\.$/, 'I have finished, sir. The gate is on $1.');
  out = out
    .replace(/^Gate’s on /, 'The gate is on ')
    .replace(
      /^Radio’s back\. Gate’s on (.*) since (.*?)\.$/,
      'The radio is back. The gate has been on $1 since $2.',
    );
  out = out.replace(
    /^Radio’s back\. (Level|Weir) at (.*?): /,
    'The radio is back. The $1 reading at $2 was: ',
  );

  out = out
    .replace(/, bang on\./g, '. I’m sure of it.')
    .replace(/\. Steady as you like\./g, '. It looks steady.')
    .replace(/\. Grand\./g, '. It looks fine.');
  out = out
    .replace(/, near enough\./g, ', or close to it.')
    .replace(/, give or take\./g, ', approximately.')
    .replace('Torch is going.', 'The torch is fading.')
    .replace(/\. Hang on\. Aye, /, '. Wait a moment. Aye, ');
  out = out
    .replace('the gate is on nothing, shut', 'the gate is shut')
    .replace('The gate is on nothing, shut', 'The gate is shut')
    .replace('to nothing, shut', 'shut')
    .replace(', sir. Definitely.', ', sir. I’m sure.');
  // A radio figure is still a reported observation, never a claim about the hidden water state.
  out = out.replace(
    /^(\(a long yawn\) )?(?!(?:It|The|I|Call|About)\b)((?:nought|one|two|three|four|five|six|seven|eight|nine) point .*)/,
    '$1I read $2',
  );
  out = out.replace(/^About (.*)\. /, 'I read about $1. ');
  out = out
    .replace(/, maybe more\./g, ', or maybe higher.')
    .replace(
      /Yes\. ((?:nought|one|two|three|four|five|six|seven|eight|nine) point [^.]+)\./g,
      'Yes, I read $1.',
    )
    .replace(
      /Aye, ((?:nought|one|two|three|four|five|six|seven|eight|nine) point [^.]+)\./g,
      'Aye, I read $1.',
    );
  return out;
}

export function hintWords(text: string): string {
  const words: Record<string, string> = {
    yes: 'He agrees.',
    'if I must': 'He agrees reluctantly.',
    "can't": 'He cannot do it.',
    no: 'He refuses.',
    'not now': 'He wants to wait.',
    'something else': 'He wants another job.',
    'in a bit, once I’m warm': 'He wants to warm up first.',
    'radio out': 'The radio is out.',
    'call; wait': 'Call and wait for his answer.',
  };
  if (words[text]) return words[text];
  if (text.startsWith('after I ')) return `He says, “I can do it after I ${text.slice(8)}.”`;
  if (text.startsWith('rather ')) return `He would rather ${text.slice(7)}.`;
  return text;
}
