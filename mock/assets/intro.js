/* intro.js — 각 단계·태스크 시작 전에 뜨는 설명 화면.
 *
 * 이 파일은 mock/assets/ 에 둔다. mock/data/ 에 두면 서비스워커가 cache-first 로
 * 처리해(sw.js 의 /data/ 규칙) 내용을 고쳐도 옛 파일이 계속 나온다 — 실제로 겪었다.
 * assets 는 network-first 라 저장하면 바로 반영된다.
 *
 * 키는 두 종류다.
 *   "R.s1"  단계(phaseKey) — 그 단계에 처음 들어갈 때
 *   "W.all:email"  단계 + 그룹타입 — 그 태스크에 처음 들어갈 때
 *
 * Writing·Speaking 의 태스크 안내는 **태스크 직전**에 떠야 한다.
 * 섹션 시작에 몰아 넣으면 학생이 읽을 시점을 놓친다(실제 시험도 태스크 직전).
 *
 * 값은 페이지 배열이다. 페이지 하나:
 *   {
 *     title: "Reading Section",
 *     body:  ["문단1", "문단2"],
 *     table: { head: ["Type of Task", "Description"],
 *              rows: [["Complete the Words", "Fill in the missing letters."]],
 *              tone: "acid" | "blaze" | "hot" },   // 표 머리 색 (기본 acid)
 *     list:  ["불릿1", "불릿2"],
 *     note:  "굵게 강조할 한 줄"
 *   }
 *   body 안에서 **굵게** 표기하면 <b> 로 나온다.
 *
 * 규칙
 *   - 배열이 비어 있거나 키가 없으면 설명 없이 바로 시작한다.
 *   - **설명을 읽는 동안 시험 시간은 흐르지 않는다.** 닫아야 타이머가 시작된다.
 *   - 한 번 본 화면은 다시 안 뜬다(새로고침·이어풀기 포함).
 */
window.NEO_INTRO = {

  /* ── Reading ─────────────────────────────────────────────── */
  "R.s1": [
    {
      title: "Reading Section",
      body: ["In the reading section, you will answer up to 50 questions to " +
             "demonstrate how well you understand written text in English. " +
             "There are three types of tasks."],
      table: {
        head: ["Type of Task", "Description"],
        tone: "acid",
        rows: [
          ["Complete the Words", "Fill in the missing letters in a paragraph."],
          ["Read in Daily Life", "Answer questions about everyday reading material."],
          ["Read an Academic Passage", "Answer questions about academic passages."]
        ]
      },
      list: ["The reading section contains two modules."],
      note: "You are ready to begin this module."
    },
    {
      title: "Module 1",
      body: ["The clock will show you how much time you have to complete Module 1.",
             "You can use **Next** and **Back** to move to the next question or " +
             "return to previous questions within the same module.",
             "You **WILL NOT** be able to return to Module 1 once you have begun " +
             "Module 2."]
    }
  ],
  "R.s2": [
    {
      title: "Module 2",
      body: ["The clock will show you how much time you have to complete Module 2.",
             "You can use **Next** and **Back** to move to the next question or " +
             "return to previous questions within the same module."]
    }
  ],

  /* ── Listening ───────────────────────────────────────────── */
  "L.s1": [
    {
      title: "Listening Section",
      body: ["In the listening section, you will answer up to 47 questions to " +
             "demonstrate how well you understand spoken English. " +
             "There are four types of tasks."],
      table: {
        head: ["Type of Task", "Description"],
        tone: "blaze",
        rows: [
          ["Listen and Choose a Response",
           "Select the best response to the question or statement."],
          ["Conversations", "Answer questions about short conversations."],
          ["Announcements",
           "Answer questions about announcements in everyday settings."],
          ["Academic Talks",
           "Answer questions about talks and lectures in a class."]
        ]
      },
      list: ["You **WILL NOT** be able to return to previous questions.",
             "The listening section contains two modules."],
      note: "You are ready to begin this module."
    },
    {
      title: "Module 1",
      body: ["The clock will indicate how much time you have to complete each question.",
             "You can use **Next** to move to the next question.",
             "The first task is **Listen and Choose a Response**. In this task, you " +
             "will listen to a sentence or question. You will then read four " +
             "sentences and choose the option that is the best response."]
    }
  ],
  "L.s2": [
    {
      title: "Module 2",
      body: ["The clock will indicate how much time you have to complete each question.",
             "You can use **Next** to move to the next question.",
             "You **WILL NOT** be able to return to previous questions."]
    }
  ],

  /* ── Writing ─────────────────────────────────────────────── */
  "W.all": [
    {
      title: "Writing Section",
      body: ["In the writing section, you will answer 12 questions to demonstrate " +
             "how well you can write in English. There are three types of tasks."],
      table: {
        head: ["Type of Task", "Description"],
        tone: "hot",
        rows: [
          ["Build a Sentence", "Create a grammatical sentence."],
          ["Write an Email", "Write an email using information provided."],
          ["Write for an Academic Discussion", "Participate in an online discussion."]
        ]
      }
    }
  ],
  "W.all:bas": [
    {
      title: "Build a Sentence",
      body: ["Move the words in the boxes to create grammatical sentences.",
             "A clock will show you how much time you have to complete this task."]
    }
  ],
  "W.all:email": [
    {
      title: "Write an Email",
      body: ["You will read some information and use the information to write an email.",
             "You will have 7 minutes to write the email."]
    }
  ],
  "W.all:disc": [
    {
      title: "Write for an Academic Discussion",
      body: ["A professor has posted a question about a topic and students have " +
             "responded with their thoughts and ideas. Make a contribution to the " +
             "discussion.",
             "You will have 10 minutes to write."]
    }
  ],

  /* ── Speaking ────────────────────────────────────────────── */
  "S.all": [
    {
      title: "Speaking Section",
      body: ["In the speaking section, you will answer 11 questions to demonstrate " +
             "how well you can speak English. There are two types of tasks."],
      table: {
        head: ["Type of Task", "Description"],
        tone: "hot",
        rows: [
          ["Listen and Repeat", "Listen and repeat what you heard."],
          ["Take an Interview", "Answer questions from the interviewer."]
        ]
      }
    }
  ],
  "S.all:repeat": [
    {
      title: "Listen and Repeat",
      body: ["You will listen as someone speaks to you. Listen carefully and then " +
             "repeat what you have heard. The clock will indicate how much time you " +
             "have to speak.",
             "Each sentence plays **once**. Begin speaking right after the beep."]
    }
  ],
  // 원본 안내가 없어 같은 형식으로 맞춰 작성했다. 문구를 주시면 교체한다.
  "S.all:interview": [
    {
      title: "Take an Interview",
      body: ["You will take part in an interview. Listen to each question and then " +
             "give your answer. The clock will indicate how much time you have to speak.",
             "Each question plays **once**. Begin speaking right after the beep."]
    }
  ]
};
