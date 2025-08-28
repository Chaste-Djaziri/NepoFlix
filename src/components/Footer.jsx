import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGithub, faInstagram } from '@fortawesome/free-brands-svg-icons';

const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#090a0a] border-t border-white/10 py-10 px-6 mt-16">
      <div className="max-w-6xl mx-auto grid gap-8 md:grid-cols-2 items-start">
        <div>
          <h2 className="text-2xl font-semibold text-white">NepoFlix</h2>
          <p className="text-gray-400 mt-1 text-sm">
            All your entertainment. One platform. Free forever.
          </p>
          <a
            href="mailto:habimanahirwa@gmail.com"
            className="inline-block mt-3 text-sm text-gray-300 hover:text-white transition"
          >
            habimanahirwa@gmail.com
          </a>
        </div>

        <div className="md:justify-self-end">
          <p className="text-gray-400 text-sm mb-3">Connect</p>
          <div className="flex items-center gap-5">
            <a
              href="https://github.com/Chaste-Djaziri"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Chaste Djaziri on GitHub"
              className="text-gray-400 hover:text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/30"
            >
              <FontAwesomeIcon icon={faGithub} className="h-6 w-6" />
            </a>
            <a
              href="https://instagram.com/chaste_djaziri"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="@chaste_djaziri on Instagram"
              className="text-gray-400 hover:text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/30"
            >
              <FontAwesomeIcon icon={faInstagram} className="h-6 w-6" />
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto mt-8 flex flex-col md:flex-row items-center justify-between text-xs text-gray-500 gap-2">
        <span>© {year} NepoFlix. All rights reserved.</span>
        <span>
          Designed &amp; built by{' '}
          <a
            href="https://github.com/Chaste-Djaziri"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-white/20 underline-offset-2 hover:text-gray-300"
          >
            Chaste Djaziri
          </a>
        </span>
      </div>
    </footer>
  );
};

export default Footer;
